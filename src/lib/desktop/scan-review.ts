export type ScanReviewFilter = "all" | "duplicates" | "metadata-errors";

export interface ScannedAudioFile {
  scanId: string;
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  metadataRead: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  durationSeconds: number | null;
  bpm: number | null;
  musicalKey: string | null;
  duplicateGroup: string | null;
}

export const DESKTOP_SCAN_PAGE_SIZE = 25;

export function filterScannedTracks(
  tracks: readonly ScannedAudioFile[],
  query: string,
  filter: ScanReviewFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es-ES");

  return tracks.filter((track) => {
    if (filter === "duplicates" && !track.duplicateGroup) return false;
    if (filter === "metadata-errors" && track.metadataRead) return false;
    if (!normalizedQuery) return true;

    return [
      track.name,
      track.relativePath,
      track.title,
      track.artist,
      track.album,
      track.genre,
      track.musicalKey,
      track.bpm?.toString(),
      track.duplicateGroup,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n")
      .toLocaleLowerCase("es-ES")
      .includes(normalizedQuery);
  });
}

export function paginateScannedTracks(
  tracks: readonly ScannedAudioFile[],
  requestedPage: number,
  requestedPageSize = DESKTOP_SCAN_PAGE_SIZE,
) {
  const pageSize =
    Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? requestedPageSize
      : DESKTOP_SCAN_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const numericPage = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1;
  const page = Math.min(Math.max(numericPage, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: tracks.slice(start, start + pageSize),
    page,
    pageSize,
    total: tracks.length,
    totalPages,
  };
}

export type OrganizationScheme =
  | "artist-album"
  | "genre"
  | "genre-artist"
  | "key-bpm"
  | "bpm-range"
  | "genre-bpm-range"
  | "energy-bpm-range"
  | "key-bpm-range"
  | "rules";

export type OrganizationRuleLevel =
  | "genre"
  | "subgenre"
  | "artist"
  | "album"
  | "key"
  | "camelot"
  | "bpm"
  | "bpm-range"
  | "energy"
  | "year";

export interface LinkedOrganizationMetadata {
  camelotKey: string | null;
  energy: number | null;
  releaseYear: number | null;
  subgenre: string | null;
}

export interface OrganizationPreviewOptions {
  bpmBoundaries?: readonly number[];
  energyByScanId?: ReadonlyMap<string, number>;
  linkedMetadataByScanId?: ReadonlyMap<string, LinkedOrganizationMetadata>;
  ruleLevels?: readonly (OrganizationRuleLevel | "")[];
}

export interface OrganizationPreviewItem {
  sourcePath: string;
  targetPath: string;
  collisionResolved: boolean;
}

export interface OrganizationTreeNode {
  name: string;
  children: OrganizationTreeNode[];
}

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const BPM_RANGE_SCHEMES = new Set<OrganizationScheme>([
  "bpm-range",
  "genre-bpm-range",
  "energy-bpm-range",
  "key-bpm-range",
]);
const LINKED_RULE_LEVELS = new Set<OrganizationRuleLevel>([
  "subgenre",
  "camelot",
  "energy",
  "year",
]);

export function organizationSchemeUsesBpmRanges(scheme: OrganizationScheme) {
  return BPM_RANGE_SCHEMES.has(scheme);
}

export function normalizeOrganizationRuleLevels(
  levels: readonly (OrganizationRuleLevel | "")[],
) {
  if (!levels.length || levels.length > 3 || !levels[0]) return null;
  const normalized: OrganizationRuleLevel[] = [];
  let sawEmpty = false;
  for (const level of levels) {
    if (!level) {
      sawEmpty = true;
      continue;
    }
    if (sawEmpty || normalized.includes(level)) return null;
    normalized.push(level);
  }
  return normalized.length ? normalized : null;
}

export function organizationRulesUseBpmRanges(
  levels: readonly (OrganizationRuleLevel | "")[],
) {
  return normalizeOrganizationRuleLevels(levels)?.includes("bpm-range") ?? false;
}

export function organizationRulesUseLinkedMetadata(
  levels: readonly (OrganizationRuleLevel | "")[],
) {
  return (
    normalizeOrganizationRuleLevels(levels)?.some((level) =>
      LINKED_RULE_LEVELS.has(level),
    ) ?? false
  );
}

export function parseBpmRangeBoundaries(input: string) {
  const tokens = input
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 8) return null;
  const boundaries = tokens.map(Number);
  return normalizeBpmRangeBoundaries(boundaries);
}

export function normalizeBpmRangeBoundaries(boundaries: readonly number[]) {
  if (!boundaries.length || boundaries.length > 8) return null;
  const normalized = [...boundaries];
  if (
    normalized.some(
      (value) => !Number.isInteger(value) || value < 20 || value > 300,
    )
  ) {
    return null;
  }
  if (
    normalized.some(
      (value, index) => index > 0 && value <= normalized[index - 1],
    )
  ) {
    return null;
  }
  return normalized;
}

export function safePathSegment(value: string | null, fallback: string) {
  const clean = (candidate: string) =>
    candidate
      .normalize("NFKC")
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .replace(/[. ]+$/, "")
      .trim()
      .slice(0, 80)
      .replace(/[. ]+$/, "");

  const segment = clean(value ?? "") || clean(fallback) || "Sin datos";
  return WINDOWS_RESERVED_NAME.test(segment) ? `_${segment}` : segment;
}

function bpmRangeFolder(bpm: number | null, boundaries: readonly number[]) {
  if (bpm === null || !Number.isFinite(bpm)) return "BPM desconocido";
  const rounded = Math.round(bpm);
  const first = boundaries[0];
  if (rounded < first) return `Menos de ${first} BPM`;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const lower = boundaries[index];
    const upperExclusive = boundaries[index + 1];
    if (rounded < upperExclusive) return `${lower}–${upperExclusive - 1} BPM`;
  }
  return `${boundaries[boundaries.length - 1]} BPM o más`;
}

function ruleLevelFolder(
  track: ScannedAudioFile,
  level: OrganizationRuleLevel,
  options: OrganizationPreviewOptions,
  bpmBoundaries: readonly number[] | null,
) {
  const linked = options.linkedMetadataByScanId?.get(track.scanId);
  switch (level) {
    case "genre":
      return safePathSegment(track.genre, "Género desconocido");
    case "subgenre":
      return safePathSegment(linked?.subgenre ?? null, "Subgénero desconocido");
    case "artist":
      return safePathSegment(track.artist, "Artista desconocido");
    case "album":
      return safePathSegment(track.album, "Sin álbum");
    case "key":
      return safePathSegment(track.musicalKey, "Tonalidad desconocida");
    case "camelot":
      return safePathSegment(linked?.camelotKey ?? null, "Camelot desconocido");
    case "bpm":
      return safePathSegment(
        track.bpm === null ? null : `${Math.round(track.bpm)} BPM`,
        "BPM desconocido",
      );
    case "bpm-range":
      return bpmBoundaries
        ? bpmRangeFolder(track.bpm, bpmBoundaries)
        : "BPM desconocido";
    case "energy": {
      const energy = linked?.energy ?? options.energyByScanId?.get(track.scanId);
      return energy !== undefined &&
        energy !== null &&
        Number.isInteger(energy) &&
        energy >= 0 &&
        energy <= 10
        ? `Energía ${energy}`
        : "Energía desconocida";
    }
    case "year":
      return linked?.releaseYear !== null && linked?.releaseYear !== undefined
        ? `${linked.releaseYear}`
        : "Año desconocido";
  }
}

function organizationFolders(
  track: ScannedAudioFile,
  scheme: OrganizationScheme,
  options: OrganizationPreviewOptions,
  bpmBoundaries: readonly number[] | null,
  ruleLevels: readonly OrganizationRuleLevel[] | null,
) {
  if (scheme === "rules" && ruleLevels) {
    return ruleLevels.map((level) =>
      ruleLevelFolder(track, level, options, bpmBoundaries),
    );
  }

  if (scheme === "genre") {
    return [safePathSegment(track.genre, "Género desconocido")];
  }

  if (scheme === "genre-artist") {
    return [
      safePathSegment(track.genre, "Género desconocido"),
      safePathSegment(track.artist, "Artista desconocido"),
    ];
  }

  if (scheme === "key-bpm") {
    return [
      safePathSegment(track.musicalKey, "Tonalidad desconocida"),
      safePathSegment(
        track.bpm === null ? null : `${Math.round(track.bpm)} BPM`,
        "BPM desconocido",
      ),
    ];
  }

  if (bpmBoundaries) {
    const range = bpmRangeFolder(track.bpm, bpmBoundaries);
    if (scheme === "bpm-range") return [range];
    if (scheme === "genre-bpm-range") {
      return [safePathSegment(track.genre, "Género desconocido"), range];
    }
    if (scheme === "key-bpm-range") {
      return [safePathSegment(track.musicalKey, "Tonalidad desconocida"), range];
    }
    if (scheme === "energy-bpm-range") {
      const linked = options.linkedMetadataByScanId?.get(track.scanId);
      const energy = linked?.energy ?? options.energyByScanId?.get(track.scanId);
      const energyFolder =
        energy !== undefined &&
        energy !== null &&
        Number.isInteger(energy) &&
        energy >= 0 &&
        energy <= 10
          ? `Energía ${energy}`
          : "Energía desconocida";
      return [energyFolder, range];
    }
  }

  return [
    safePathSegment(track.artist, "Artista desconocido"),
    safePathSegment(track.album, "Sin álbum"),
  ];
}

export function createOrganizationPreview(
  tracks: readonly ScannedAudioFile[],
  scheme: OrganizationScheme,
  options: OrganizationPreviewOptions = {},
) {
  const ruleLevels =
    scheme === "rules"
      ? normalizeOrganizationRuleLevels(options.ruleLevels ?? [])
      : null;
  if (scheme === "rules" && !ruleLevels) return [];
  const usesBpmRanges =
    organizationSchemeUsesBpmRanges(scheme) ||
    (ruleLevels?.includes("bpm-range") ?? false);
  const bpmBoundaries = usesBpmRanges
    ? normalizeBpmRangeBoundaries(options.bpmBoundaries ?? [])
    : null;
  if (usesBpmRanges && !bpmBoundaries) return [];
  const usedTargets = new Set<string>();

  return [...tracks]
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, "es", {
        sensitivity: "base",
      }),
    )
    .map<OrganizationPreviewItem>((track) => {
      const folders = organizationFolders(
        track,
        scheme,
        options,
        bpmBoundaries,
        ruleLevels,
      );
      const originalStem = track.name.replace(/\.[^.]+$/, "");
      const stem = safePathSegment(track.title, originalStem || "Pista sin nombre");
      const extension =
        track.extension.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase() ||
        "audio";
      let suffix = 1;
      let targetPath = [...folders, `${stem}.${extension}`].join("/");

      while (usedTargets.has(targetPath.toLocaleLowerCase("es-ES"))) {
        suffix += 1;
        targetPath = [...folders, `${stem} (${suffix}).${extension}`].join(
          "/",
        );
      }

      usedTargets.add(targetPath.toLocaleLowerCase("es-ES"));
      return {
        sourcePath: track.relativePath,
        targetPath,
        collisionResolved: suffix > 1,
      };
    });
}

export function createOrganizationTree(
  preview: readonly OrganizationPreviewItem[],
): OrganizationTreeNode[] {
  type OrganizationTreeMap = Map<string, OrganizationTreeMap>;
  const root: OrganizationTreeMap = new Map();
  for (const item of preview) {
    const folders = item.targetPath.split("/").slice(0, -1);
    let cursor = root;
    for (const folder of folders) {
      let child = cursor.get(folder);
      if (!child) {
        child = new Map();
        cursor.set(folder, child);
      }
      cursor = child;
    }
  }

  const toNodes = (node: OrganizationTreeMap): OrganizationTreeNode[] =>
    [...node.entries()]
      .sort(([left], [right]) =>
        left.localeCompare(right, "es", { sensitivity: "base" }),
      )
      .map(([name, children]) => ({
        name,
        children: toNodes(children),
      }));

  return toNodes(root);
}
