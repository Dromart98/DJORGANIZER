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
  | "genre-artist"
  | "key-bpm";

export interface OrganizationPreviewItem {
  sourcePath: string;
  targetPath: string;
  collisionResolved: boolean;
}

const WINDOWS_RESERVED_NAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

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

function organizationFolders(
  track: ScannedAudioFile,
  scheme: OrganizationScheme,
) {
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

  return [
    safePathSegment(track.artist, "Artista desconocido"),
    safePathSegment(track.album, "Sin álbum"),
  ];
}

export function createOrganizationPreview(
  tracks: readonly ScannedAudioFile[],
  scheme: OrganizationScheme,
) {
  const usedTargets = new Set<string>();

  return [...tracks]
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, "es", {
        sensitivity: "base",
      }),
    )
    .map<OrganizationPreviewItem>((track) => {
      const folders = organizationFolders(track, scheme);
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
