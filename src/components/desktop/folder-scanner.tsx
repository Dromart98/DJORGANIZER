"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  getDesktopCratesForExportAction,
  getDesktopLibraryLinkCandidatesAction,
  reconcileVirtualDjListAction,
  recordVirtualDjExportsAction,
  type DesktopCrateExport,
} from "@/app/import/actions";
import {
  createOrganizationPreview,
  filterScannedTracks,
  paginateScannedTracks,
  type OrganizationScheme,
  type ScanReviewFilter,
  type ScannedAudioFile,
} from "@/lib/desktop/scan-review";
import { translate, translateKnown } from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";

interface TauriCore {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface FolderScanResult {
  sessionId: string;
  rootName: string;
  tracks: ScannedAudioFile[];
  examinedEntries: number;
  skippedEntries: number;
  metadataFailures: number;
  duplicateGroups: number;
  duplicateTracks: number;
  fingerprintFailures: number;
  truncated: boolean;
}

interface IncrementalScanResult {
  addedScanIds: string[];
  addedTracks: number;
  removedScanIds: string[];
  removedTracks: number;
  scan: FolderScanResult;
  unchangedTracks: number;
  updatedScanIds: string[];
  updatedTracks: number;
}

interface VirtualDjExportResult {
  cancelled: boolean;
  exportedTracks: number;
}

interface LibraryTrackLink {
  scanId: string;
  trackId: string;
}

interface LibraryLinkResult {
  fingerprintFailures: number;
  linkedTracks: number;
  links: LibraryTrackLink[];
  unmatchedTracks: number;
}

interface ReorganizationMove {
  scanId: string;
  sourcePath: string;
  targetPath: string;
}

interface ReorganizationResult {
  applied: boolean;
  moves: ReorganizationMove[];
  runId: string | null;
}

interface ReorganizationHistoryItem {
  createdAt: number;
  moveCount: number;
  runId: string;
  undone: boolean;
}

interface MetadataDraft {
  album: string;
  artist: string;
  bpm: string;
  genre: string;
  musicalKey: string;
  title: string;
}

interface MetadataWritePreview {
  files: Array<{
    changes: Array<{
      after: string | null;
      before: string | null;
      field: string;
    }>;
    relativePath: string;
    scanId: string;
  }>;
}

interface MetadataWriteResult {
  appliedFiles: number;
  runId: string | null;
  updatedTracks: ScannedAudioFile[];
}

interface MetadataWriteHistoryItem {
  createdAt: number;
  fileCount: number;
  runId: string;
  undone: boolean;
}

interface VirtualDjBatchExportResult {
  backedUpFiles: number;
  cancelled: boolean;
  exportedLists: number;
  exportedTracks: number;
}

interface VirtualDjImportPreview {
  cancelled: boolean;
  lists: Array<{
    linkedTrackIds: string[];
    name: string;
    relativePath: string;
    unresolvedPaths: string[];
  }>;
}

type VirtualDjExportFormat = "xml" | "m3u8";
const MAX_METADATA_WRITE_TRACKS = 25;
const WATCH_INTERVAL_MS = 30_000;

function metadataDraftFromTrack(track: ScannedAudioFile): MetadataDraft {
  return {
    album: track.album ?? "",
    artist: track.artist ?? "",
    bpm: track.bpm?.toString() ?? "",
    genre: track.genre ?? "",
    musicalKey: track.musicalKey ?? "",
    title: track.title ?? "",
  };
}

function metadataFieldLabel(locale: Locale, field: string) {
  const label = (
    {
      album: "Álbum",
      artist: "Artista",
      bpm: "BPM",
      genre: "Género",
      musicalKey: "Tonalidad",
      title: "Título",
    }[field] ?? field
  );
  return translate(locale, label as Parameters<typeof translate>[1]);
}

function metadataDisplayValue(locale: Locale, value: string | null) {
  return value?.trim() || (locale === "en" ? "empty" : "vacío");
}

function getTauriCore(): TauriCore | undefined {
  if (typeof window === "undefined") return undefined;

  return (
    window as Window & {
      __TAURI__?: {
        core?: TauriCore;
      };
    }
  ).__TAURI__?.core;
}

function commandErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}

function formatFileSize(locale: Locale, bytes: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: bytes >= 1_000_000 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(bytes >= 1_000_000 ? bytes / 1_000_000 : bytes / 1_000);
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatTrackDetails(locale: Locale, track: ScannedAudioFile) {
  const details: string[] = [];

  if (track.bpm !== null) {
    details.push(
      `${track.bpm.toLocaleString(locale, { maximumFractionDigits: 1 })} BPM`,
    );
  }
  if (track.musicalKey) details.push(track.musicalKey);
  if (track.durationSeconds !== null) {
    details.push(formatDuration(track.durationSeconds));
  }
  details.push(track.extension.toUpperCase());
  details.push(formatFileSize(locale, track.sizeBytes));

  return details.join(" · ");
}

function formatTrackIdentity(track: ScannedAudioFile) {
  const identity = [track.artist, track.album, track.genre].filter(
    (value): value is string => Boolean(value),
  );
  return identity.length ? identity.join(" · ") : track.relativePath;
}

export function DesktopFolderScanner() {
  const { format, locale, t } = useTranslator();
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [incrementalScanning, setIncrementalScanning] = useState(false);
  const [watchingFolder, setWatchingFolder] = useState(false);
  const [incrementalMessage, setIncrementalMessage] = useState<string | null>(
    null,
  );
  const incrementalScanInFlight = useRef(false);
  const [result, setResult] = useState<FolderScanResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [libraryLinkMessage, setLibraryLinkMessage] = useState<string | null>(
    null,
  );
  const [linkedScanIds, setLinkedScanIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScanReviewFilter>("all");
  const [page, setPage] = useState(1);
  const [organizationScheme, setOrganizationScheme] =
    useState<OrganizationScheme>("artist-album");
  const [virtualDjListName, setVirtualDjListName] = useState("DJOrganizer");
  const [exportingVirtualDj, setExportingVirtualDj] =
    useState<VirtualDjExportFormat | null>(null);
  const [virtualDjMessage, setVirtualDjMessage] = useState<string | null>(null);
  const [desktopCrates, setDesktopCrates] = useState<DesktopCrateExport[]>([]);
  const [virtualDjImport, setVirtualDjImport] =
    useState<VirtualDjImportPreview | null>(null);
  const [reconcilingList, setReconcilingList] = useState<string | null>(null);
  const [reorganizationBusy, setReorganizationBusy] = useState(false);
  const [reorganizationMessage, setReorganizationMessage] =
    useState<string | null>(null);
  const [lastReorganizationRunId, setLastReorganizationRunId] =
    useState<string | null>(null);
  const [reorganizationHistory, setReorganizationHistory] = useState<
    ReorganizationHistoryItem[]
  >([]);
  const [metadataDrafts, setMetadataDrafts] = useState<
    Record<string, MetadataDraft>
  >({});
  const [metadataPreview, setMetadataPreview] =
    useState<MetadataWritePreview | null>(null);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);
  const [lastMetadataRunId, setLastMetadataRunId] = useState<string | null>(
    null,
  );
  const [metadataHistory, setMetadataHistory] = useState<
    MetadataWriteHistoryItem[]
  >([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(
    () => new Set(),
  );
  const filteredTracks = useMemo(
    () => filterScannedTracks(result?.tracks ?? [], query, filter),
    [filter, query, result],
  );
  const pagination = useMemo(
    () => paginateScannedTracks(filteredTracks, page),
    [filteredTracks, page],
  );
  const selectedTracks = useMemo(
    () =>
      result?.tracks.filter((track) =>
        selectedTrackIds.has(track.scanId),
      ) ?? [],
    [result, selectedTrackIds],
  );
  const organizationPreview = useMemo(
    () => createOrganizationPreview(selectedTracks, organizationScheme),
    [organizationScheme, selectedTracks],
  );
  const visibleTrackIds = pagination.items.map((track) => track.scanId);
  const allVisibleSelected =
    visibleTrackIds.length > 0 &&
    visibleTrackIds.every((scanId) => selectedTrackIds.has(scanId));

  useEffect(() => {
    setDesktopAvailable(Boolean(getTauriCore()));
  }, []);

  useEffect(() => {
    if (!selectedTracks.length) return;
    setMetadataDrafts((current) => {
      let changed = false;
      const next = { ...current };
      for (const track of selectedTracks) {
        if (!next[track.scanId]) {
          next[track.scanId] = metadataDraftFromTrack(track);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [selectedTracks]);

  const linkLibraryTracks = useCallback(
    async (core: TauriCore, scanResult: FolderScanResult) => {
      setLibraryLinkMessage(
        locale === "en"
          ? "Comparing with your DJOrganizer library…"
          : "Comparando con tu biblioteca de DJOrganizer…",
      );

      try {
        const library = await getDesktopLibraryLinkCandidatesAction();
        if (!library.candidates.length) {
          setLibraryLinkMessage(
            library.message
              ? translateKnown(locale, library.message)
              : t("No hay pistas con huella en tu biblioteca para vincular."),
          );
          return;
        }

        const linkResult = await core.invoke<LibraryLinkResult>(
          "link_library_tracks",
          {
            sessionId: scanResult.sessionId,
            candidates: library.candidates,
          },
        );
        setLinkedScanIds(
          new Set(linkResult.links.map((link) => link.scanId)),
        );
        const failureMessage = linkResult.fingerprintFailures
          ? locale === "en"
            ? ` ${linkResult.fingerprintFailures.toLocaleString(locale)} local files could not be checked.`
            : ` No se pudieron comprobar ${linkResult.fingerprintFailures.toLocaleString(locale)} archivos locales.`
          : "";
        const limitMessage = library.message
          ? ` ${translateKnown(locale, library.message)}`
          : "";
        setLibraryLinkMessage(
          locale === "en"
            ? `${linkResult.linkedTracks.toLocaleString(locale)} library tracks linked to this device; ${linkResult.unmatchedTracks.toLocaleString(locale)} without a local match.${failureMessage}${limitMessage}`
            : `${linkResult.linkedTracks.toLocaleString(locale)} pistas de la biblioteca vinculadas a este dispositivo; ${linkResult.unmatchedTracks.toLocaleString(locale)} sin coincidencia local.${failureMessage}${limitMessage}`,
        );
        const crateResult = await getDesktopCratesForExportAction();
        setDesktopCrates(crateResult.crates);
        if (crateResult.message) {
          setVirtualDjMessage(translateKnown(locale, crateResult.message));
        }
      } catch {
        setLibraryLinkMessage(
          locale === "en"
            ? "The scan finished, but the library could not be linked. Try again by selecting the folder again."
            : "El escaneo terminó, pero no se pudo vincular con la biblioteca. Puedes volver a intentarlo seleccionando la carpeta de nuevo.",
        );
      }
    },
    [locale, t],
  );

  async function chooseAndScan() {
    const core = getTauriCore();
    if (!core || incrementalScanInFlight.current) return;

    setWatchingFolder(false);
    setScanning(true);
    setMessage(null);

    try {
      const nextResult = await core.invoke<FolderScanResult | null>(
        "choose_and_scan_music_folder",
      );
      if (!nextResult) {
        setMessage(t("Selección cancelada. No se ha leído ningún archivo."));
        return;
      }

      setResult(nextResult);
      setWatchingFolder(false);
      setIncrementalMessage(null);
      setQuery("");
      setFilter("all");
      setPage(1);
      setVirtualDjListName(nextResult.rootName);
      setVirtualDjMessage(null);
      setSelectedTrackIds(new Set());
      setLinkedScanIds(new Set());
      setLastReorganizationRunId(null);
      setReorganizationHistory([]);
      setMetadataDrafts({});
      setMetadataPreview(null);
      setMetadataMessage(null);
      setLastMetadataRunId(null);
      setMetadataHistory([]);
      await linkLibraryTracks(core, nextResult);
    } catch {
      setMessage(
        t("No se pudo leer esa carpeta. Comprueba sus permisos y vuelve a intentarlo."),
      );
    } finally {
      setScanning(false);
    }
  }

  const refreshIncrementalScan = useCallback(
    async (automatic = false) => {
      const core = getTauriCore();
      if (!core || !result || incrementalScanInFlight.current) return;

      incrementalScanInFlight.current = true;
      setIncrementalScanning(true);
      if (!automatic) {
        setIncrementalMessage(
          locale === "en" ? "Looking for local changes…" : "Buscando cambios locales…",
        );
      }

      try {
        const incremental = await core.invoke<IncrementalScanResult>(
          "scan_music_folder_incrementally",
          { sessionId: result.sessionId },
        );
        const activeScanIds = new Set(
          incremental.scan.tracks.map((track) => track.scanId),
        );
        const invalidDraftIds = new Set([
          ...incremental.removedScanIds,
          ...incremental.updatedScanIds,
        ]);

        setResult(incremental.scan);
        setSelectedTrackIds(
          (current) =>
            new Set([...current].filter((scanId) => activeScanIds.has(scanId))),
        );
        setLinkedScanIds(
          (current) =>
            new Set([...current].filter((scanId) => activeScanIds.has(scanId))),
        );
        setMetadataDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([scanId]) =>
                activeScanIds.has(scanId) && !invalidDraftIds.has(scanId),
            ),
          ),
        );
        setMetadataPreview(null);

        const changedTracks =
          incremental.addedTracks +
          incremental.updatedTracks +
          incremental.removedTracks;
        if (changedTracks) {
          setIncrementalMessage(
            locale === "en"
              ? `Changes applied: ${incremental.addedTracks.toLocaleString(locale)} added, ${incremental.updatedTracks.toLocaleString(locale)} updated and ${incremental.removedTracks.toLocaleString(locale)} removed. ${incremental.unchangedTracks.toLocaleString(locale)} remain unchanged.`
              : `Cambios incorporados: ${incremental.addedTracks.toLocaleString(locale)} nuevas, ${incremental.updatedTracks.toLocaleString(locale)} actualizadas y ${incremental.removedTracks.toLocaleString(locale)} retiradas. ${incremental.unchangedTracks.toLocaleString(locale)} permanecen sin cambios.`,
          );
          await linkLibraryTracks(core, incremental.scan);
        } else {
          setIncrementalMessage(
            locale === "en"
              ? `No changes. ${incremental.unchangedTracks.toLocaleString(locale)} tracks remain up to date.`
              : `Sin cambios. ${incremental.unchangedTracks.toLocaleString(locale)} pistas siguen al día.`,
          );
        }
      } catch (error) {
        setIncrementalMessage(
          commandErrorMessage(
            error,
            t("No se pudo comprobar la carpeta. Se volverá a intentar mientras la vigilancia siga activa."),
          ),
        );
      } finally {
        incrementalScanInFlight.current = false;
        setIncrementalScanning(false);
      }
    },
    [linkLibraryTracks, locale, result, t],
  );

  useEffect(() => {
    if (!watchingFolder || !result || result.truncated) return;

    const interval = window.setInterval(() => {
      void refreshIncrementalScan(true);
    }, WATCH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refreshIncrementalScan, result, watchingFolder]);

  function toggleTrack(scanId: string) {
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(scanId)) {
        next.delete(scanId);
      } else {
        next.add(scanId);
      }
      return next;
    });
  }

  function toggleVisibleTracks() {
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      for (const scanId of visibleTrackIds) {
        if (allVisibleSelected) {
          next.delete(scanId);
        } else {
          next.add(scanId);
        }
      }
      return next;
    });
  }

  async function exportToVirtualDj(format: VirtualDjExportFormat) {
    const core = getTauriCore();
    if (!core || !result || !selectedTracks.length) return;

    setExportingVirtualDj(format);
    setVirtualDjMessage(null);

    try {
      const command =
        format === "xml"
          ? "export_virtualdj_list"
          : "export_virtualdj_m3u8";
      const exportResult = await core.invoke<VirtualDjExportResult>(command, {
        sessionId: result.sessionId,
        trackIds: selectedTracks.map((track) => track.scanId),
        listName: virtualDjListName,
      });
      const formatLabel = format === "xml" ? "XML nativa" : "M3U8";
      setVirtualDjMessage(
        exportResult.cancelled
          ? t("Exportación cancelada. No se ha escrito ninguna lista.")
          : locale === "en"
            ? `${formatLabel} list saved with ${exportResult.exportedTracks.toLocaleString(locale)} tracks.`
            : `Lista ${formatLabel} guardada con ${exportResult.exportedTracks.toLocaleString(locale)} pistas.`,
      );
    } catch {
      setVirtualDjMessage(
        format === "xml"
          ? t("No se pudo guardar la lista XML. Vuelve a escanear la carpeta y comprueba el destino elegido.")
          : t("No se pudo guardar la lista M3U8. Si alguna ruta contiene saltos de línea, usa el formato XML."),
      );
    } finally {
      setExportingVirtualDj(null);
    }
  }

  async function exportCratesToVirtualDj() {
    const core = getTauriCore();
    if (!core || !result || !desktopCrates.length) return;
    setVirtualDjMessage(null);
    try {
      const exportResult = await core.invoke<VirtualDjBatchExportResult>(
        "export_virtualdj_crates",
        {
          crates: desktopCrates.map((crate) => ({
            hierarchy: crate.hierarchy,
            name: crate.name,
            trackIds: crate.trackIds,
          })),
          sessionId: result.sessionId,
        },
      );
      let historyRecorded = true;
      if (!exportResult.cancelled) {
        try {
          const history = await recordVirtualDjExportsAction(
            desktopCrates.map((crate) => ({
              name: [...crate.hierarchy, crate.name].join(" / ").slice(0, 120),
              trackIds: crate.trackIds,
            })),
          );
          historyRecorded = history.ok;
        } catch {
          historyRecorded = false;
        }
      }
      setVirtualDjMessage(
        exportResult.cancelled
          ? t("Exportación de crates cancelada.")
          : locale === "en"
            ? `${exportResult.exportedLists} crates exported with ${exportResult.exportedTracks} tracks.${exportResult.backedUpFiles ? ` ${exportResult.backedUpFiles} existing Lists were protected with backups.` : ""}${historyRecorded ? "" : ` ${t("La exportación terminó, pero no se pudo registrar el historial remoto.")}`}`
            : `${exportResult.exportedLists} crates exportados con ${exportResult.exportedTracks} pistas.${exportResult.backedUpFiles ? ` Se protegieron ${exportResult.backedUpFiles} Lists existentes con copias de seguridad.` : ""}${historyRecorded ? "" : ` ${t("La exportación terminó, pero no se pudo registrar el historial remoto.")}`}`,
      );
    } catch (error) {
      setVirtualDjMessage(
        commandErrorMessage(
          error,
          t("No se pudieron exportar los crates completos."),
        ),
      );
    }
  }

  async function importVirtualDjLists() {
    const core = getTauriCore();
    if (!core || !result) return;
    setVirtualDjMessage(null);
    try {
      const preview = await core.invoke<VirtualDjImportPreview>(
        "import_virtualdj_my_lists",
        { sessionId: result.sessionId },
      );
      setVirtualDjImport(preview.cancelled ? null : preview);
      setVirtualDjMessage(
        preview.cancelled
          ? t("Importación cancelada.")
          : locale === "en"
            ? `${preview.lists.length} Lists read in preview. No crate has been overwritten.`
            : `${preview.lists.length} Lists leídas en previsualización. No se ha sobrescrito ningún crate.`,
      );
    } catch (error) {
      setVirtualDjMessage(
        commandErrorMessage(
          error,
          t("No se pudieron leer las Lists de VirtualDJ."),
        ),
      );
    }
  }

  async function reconcileVirtualDjList(
    list: VirtualDjImportPreview["lists"][number],
    mode: "merge" | "replace",
  ) {
    if (
      mode === "replace" &&
      !window.confirm(
        locale === "en"
          ? `The contents of crate “${list.name}” will be replaced by the ${list.linkedTrackIds.length} linked VirtualDJ tracks. Unlinked tracks will not be imported. Continue?`
          : `Se reemplazará el contenido del crate “${list.name}” por las ${list.linkedTrackIds.length} pistas vinculadas de VirtualDJ. Las pistas no vinculadas no se importarán. ¿Continuar?`,
      )
    ) {
      return;
    }

    setReconcilingList(list.relativePath);
    setVirtualDjMessage(null);
    const pathSegments = list.relativePath
      .replace(/\\/g, "/")
      .replace(/\.xml$/i, "")
      .split("/")
      .filter(Boolean);

    try {
      const reconciliation = await reconcileVirtualDjListAction({
        hierarchy: pathSegments.slice(0, -1),
        linkedTrackIds: list.linkedTrackIds,
        listName: list.name,
        mode,
        unresolvedCount: list.unresolvedPaths.length,
      });
      setVirtualDjMessage(translateKnown(locale, reconciliation.message));
      if (reconciliation.ok) {
        const crateResult = await getDesktopCratesForExportAction();
        setDesktopCrates(crateResult.crates);
      }
    } finally {
      setReconcilingList(null);
    }
  }

  function updateMetadataDraft(
    scanId: string,
    field: keyof MetadataDraft,
    value: string,
  ) {
    setMetadataDrafts((current) => ({
      ...current,
      [scanId]: {
        ...(current[scanId] ??
          metadataDraftFromTrack(
            selectedTracks.find((track) => track.scanId === scanId)!,
          )),
        [field]: value,
      },
    }));
    setMetadataPreview(null);
    setMetadataMessage(null);
  }

  function metadataWriteRequest() {
    return {
      edits: selectedTracks.map((track) => {
        const draft =
          metadataDrafts[track.scanId] ?? metadataDraftFromTrack(track);
        return {
          ...draft,
          bpm: draft.bpm.trim() ? Number(draft.bpm.replace(",", ".")) : null,
          scanId: track.scanId,
        };
      }),
      sessionId: result!.sessionId,
    };
  }

  function metadataSelectionIsValid() {
    return (
      selectedTracks.length > 0 &&
      selectedTracks.length <= MAX_METADATA_WRITE_TRACKS &&
      selectedTracks.every((track) => {
        const bpm = (
          metadataDrafts[track.scanId] ?? metadataDraftFromTrack(track)
        ).bpm.trim();
        if (!bpm) return true;
        const parsed = Number(bpm.replace(",", "."));
        return Number.isFinite(parsed) && parsed >= 20 && parsed <= 300;
      })
    );
  }

  function mergeUpdatedTracks(updatedTracks: ScannedAudioFile[]) {
    const updates = new Map(
      updatedTracks.map((track) => [track.scanId, track]),
    );
    setResult((current) =>
      current
        ? {
            ...current,
            tracks: current.tracks.map(
              (track) => updates.get(track.scanId) ?? track,
            ),
          }
        : current,
    );
    setMetadataDrafts((current) => {
      const next = { ...current };
      for (const track of updatedTracks) {
        next[track.scanId] = metadataDraftFromTrack(track);
      }
      return next;
    });
  }

  async function runMetadataWrite(apply: boolean) {
    const core = getTauriCore();
    if (!core || !result || !metadataSelectionIsValid()) return;
    if (
      apply &&
      (!metadataPreview?.files.length ||
        !window.confirm(
          locale === "en"
            ? `Tags will be written to ${metadataPreview.files.length} files. Each complete file will be copied first and you can undo while this session remains open. Continue?`
            : `Se escribirán etiquetas en ${metadataPreview.files.length} archivos. Antes se copiará cada archivo completo y podrás deshacer mientras esta sesión siga abierta. ¿Continuar?`,
        ))
    ) {
      return;
    }
    setMetadataBusy(true);
    setMetadataMessage(null);
    try {
      if (!apply) {
        const preview = await core.invoke<MetadataWritePreview>(
          "preview_metadata_writes",
          { request: metadataWriteRequest() },
        );
        setMetadataPreview(preview);
        setMetadataMessage(
          preview.files.length
            ? locale === "en"
              ? `${preview.files.length} files have prepared changes. Review each field before confirming.`
              : `${preview.files.length} archivos tienen cambios preparados. Revisa cada campo antes de confirmar.`
            : t("Las etiquetas ya coinciden con los valores revisados."),
        );
        return;
      }
      const writeResult = await core.invoke<MetadataWriteResult>(
        "apply_metadata_writes",
        { request: metadataWriteRequest() },
      );
      mergeUpdatedTracks(writeResult.updatedTracks);
      setLastMetadataRunId(writeResult.runId);
      setMetadataPreview(null);
      setMetadataHistory(
        await core.invoke<MetadataWriteHistoryItem[]>(
          "list_metadata_write_history",
          { sessionId: result.sessionId },
        ),
      );
      setMetadataMessage(
        locale === "en"
          ? `${writeResult.appliedFiles} files updated and verified. Complete copies remain in a private folder excluded from scanning.`
          : `${writeResult.appliedFiles} archivos actualizados y verificados. Las copias completas quedan en una carpeta privada excluida del escaneo.`,
      );
    } catch (error) {
      setMetadataMessage(
        commandErrorMessage(
          error,
          apply
            ? t("No se pudieron escribir los metadatos; el lote no se aplicó.")
            : t("No se pudo preparar la previsualización."),
        ),
      );
    } finally {
      setMetadataBusy(false);
    }
  }

  async function undoLastMetadataWrite() {
    const core = getTauriCore();
    if (!core || !result || !lastMetadataRunId) return;
    setMetadataBusy(true);
    setMetadataMessage(null);
    try {
      const undoResult = await core.invoke<MetadataWriteResult>(
        "undo_metadata_writes",
        {
          runId: lastMetadataRunId,
          sessionId: result.sessionId,
        },
      );
      mergeUpdatedTracks(undoResult.updatedTracks);
      setLastMetadataRunId(null);
      setMetadataPreview(null);
      setMetadataHistory(
        await core.invoke<MetadataWriteHistoryItem[]>(
          "list_metadata_write_history",
          { sessionId: result.sessionId },
        ),
      );
      setMetadataMessage(
        locale === "en"
          ? `${undoResult.appliedFiles} files restored from their original copies.`
          : `${undoResult.appliedFiles} archivos restaurados desde sus copias originales.`,
      );
    } catch (error) {
      setMetadataMessage(
        commandErrorMessage(
          error,
          t("No se pudo deshacer la escritura de metadatos."),
        ),
      );
    } finally {
      setMetadataBusy(false);
    }
  }

  async function runReorganization(apply: boolean) {
    const core = getTauriCore();
    if (!core || !result || !selectedTracks.length) return;
    if (
      apply &&
      !window.confirm(
        locale === "en"
          ? `${selectedTracks.length} files will be moved inside ${result.rootName}. You can undo this operation while the session remains open. Continue?`
          : `Se moverán ${selectedTracks.length} archivos dentro de ${result.rootName}. Podrás deshacer esta operación mientras la sesión siga abierta. ¿Continuar?`,
      )
    ) {
      return;
    }
    setReorganizationBusy(true);
    setReorganizationMessage(null);
    try {
      const plan = await core.invoke<ReorganizationResult>(
        apply ? "apply_reorganization_plan" : "preview_reorganization_plan",
        {
          request: {
            scheme: organizationScheme,
            sessionId: result.sessionId,
            trackIds: selectedTracks.map((track) => track.scanId),
          },
        },
      );
      if (apply) {
        const paths = new Map(
          plan.moves.map((move) => [move.scanId, move.targetPath]),
        );
        setResult((current) =>
          current
            ? {
                ...current,
                tracks: current.tracks.map((track) => ({
                  ...track,
                  relativePath: paths.get(track.scanId) ?? track.relativePath,
                })),
              }
            : current,
        );
        setLastReorganizationRunId(plan.runId);
        setReorganizationHistory(
          await core.invoke<ReorganizationHistoryItem[]>(
            "list_reorganization_history",
            { sessionId: result.sessionId },
          ),
        );
      }
      setReorganizationMessage(
        apply
          ? locale === "en"
            ? `${plan.moves.length} files reorganized. History allows you to undo this operation.`
            : `${plan.moves.length} archivos reorganizados. El historial permite deshacer esta operación.`
          : locale === "en"
            ? `Final simulation validated: ${plan.moves.length} collision-free moves.`
            : `Simulación final validada: ${plan.moves.length} movimientos sin colisiones.`,
      );
    } catch (error) {
      setReorganizationMessage(
        commandErrorMessage(
          error,
          t("No se pudo validar el plan de reorganización."),
        ),
      );
    } finally {
      setReorganizationBusy(false);
    }
  }

  async function undoLastReorganization() {
    const core = getTauriCore();
    if (!core || !lastReorganizationRunId || !result) return;
    setReorganizationBusy(true);
    try {
      const undoResult = await core.invoke<ReorganizationResult>(
        "undo_reorganization",
        { runId: lastReorganizationRunId },
      );
      const paths = new Map(
        undoResult.moves.map((move) => [move.scanId, move.targetPath]),
      );
      setResult((current) =>
        current
          ? {
              ...current,
              tracks: current.tracks.map((track) => ({
                ...track,
                relativePath: paths.get(track.scanId) ?? track.relativePath,
              })),
            }
          : current,
      );
      setLastReorganizationRunId(null);
      setReorganizationHistory(
        await core.invoke<ReorganizationHistoryItem[]>(
          "list_reorganization_history",
          { sessionId: result.sessionId },
        ),
      );
      setReorganizationMessage(
        locale === "en"
          ? `${undoResult.moves.length} moves successfully undone.`
          : `${undoResult.moves.length} movimientos deshechos correctamente.`,
      );
    } catch (error) {
      setReorganizationMessage(
        commandErrorMessage(
          error,
          t("No se pudo deshacer la reorganización."),
        ),
      );
    } finally {
      setReorganizationBusy(false);
    }
  }

  if (!desktopAvailable) return null;

  return (
    <div className="import-flow">
      <section className="card import-dropzone" aria-labelledby="desktop-scan-title">
        <div>
          <p className="eyebrow">{t("Aplicación de escritorio")}</p>
          <h2 id="desktop-scan-title">{t("Escanear una carpeta musical")}</h2>
          <p>
            {t("El selector nativo requiere una confirmación explícita. El escaneo lee etiquetas, propiedades técnicas y copias exactas en este dispositivo, y vincula coincidencias con tu biblioteca. No mueve, modifica, reproduce, sube ni guarda audio.")}
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={scanning || incrementalScanning}
          onClick={() => void chooseAndScan()}
          type="button"
        >
          {scanning ? t("Leyendo y comparando…") : t("Seleccionar carpeta")}
        </button>
      </section>

      {message ? (
        <p className="form-message form-message--error" role="status">
          {message}
        </p>
      ) : null}

      {result ? (
        <section className="card organization-form" aria-live="polite">
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">{t("Resultado local")}</p>
              <h2>{result.rootName}</h2>
            </div>
            <span>{result.tracks.length.toLocaleString(locale)} {t("pistas")}</span>
          </div>
          {libraryLinkMessage ? (
            <p className="organization-muted" role="status">
              {libraryLinkMessage}
            </p>
          ) : null}
          <p className="organization-muted">
            {locale === "en" ? "Reviewed" : "Se revisaron"}{" "}
            {result.examinedEntries.toLocaleString(locale)}{" "}
            {locale === "en" ? "entries" : "entradas"}
            {result.skippedEntries
              ? locale === "en"
                ? ` and ${result.skippedEntries.toLocaleString(locale)} inaccessible entries were skipped`
                : ` y se omitieron ${result.skippedEntries.toLocaleString(locale)} sin acceso`
              : ""}
            {result.metadataFailures
              ? locale === "en"
                ? `; ${result.metadataFailures.toLocaleString(locale)} tracks kept file data only`
                : `; ${result.metadataFailures.toLocaleString(locale)} pistas conservaron solo los datos del archivo`
              : ""}
            {result.duplicateGroups
              ? locale === "en"
                ? `; ${result.duplicateTracks.toLocaleString(locale)} tracks form ${result.duplicateGroups.toLocaleString(locale)} exact-copy groups`
                : `; ${result.duplicateTracks.toLocaleString(locale)} pistas forman ${result.duplicateGroups.toLocaleString(locale)} grupos de copias exactas`
              : locale === "en"
                ? "; no exact copies were detected"
                : "; no se detectaron copias exactas"}
            {result.fingerprintFailures
              ? locale === "en"
                ? `; ${result.fingerprintFailures.toLocaleString(locale)} files could not be compared`
                : `; no se pudieron comparar ${result.fingerprintFailures.toLocaleString(locale)} archivos`
              : ""}
            .{result.truncated ? ` ${t("El resultado alcanzó el límite de seguridad.")}` : ""}
          </p>
          <section
            aria-labelledby="folder-watch-title"
            className="desktop-folder-watch"
          >
            <div>
              <h3 id="folder-watch-title">{t("Vigilancia incremental")}</h3>
              <p className="organization-muted">
                {t("Reutiliza las pistas sin cambios y vuelve a leer únicamente los archivos nuevos o modificados. Funciona solo durante esta sesión de escritorio y nunca expone la ruta local.")}
              </p>
            </div>
            <div className="desktop-folder-watch__controls">
              <label>
                <input
                  checked={watchingFolder}
                  disabled={scanning || result.truncated}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setWatchingFolder(enabled);
                    if (enabled) void refreshIncrementalScan(true);
                  }}
                  type="checkbox"
                />
                {t("Comprobar automáticamente cada 30 segundos")}
              </label>
              <button
                className="button button--secondary"
                disabled={scanning || incrementalScanning || result.truncated}
                onClick={() => void refreshIncrementalScan()}
                type="button"
              >
                {incrementalScanning
                  ? t("Comprobando cambios…")
                  : t("Buscar cambios ahora")}
              </button>
            </div>
            {result.truncated ? (
              <p className="form-message form-message--error" role="status">
                {t("La vigilancia se desactiva para resultados truncados porque una vista parcial no permite distinguir retiradas con seguridad.")}
              </p>
            ) : incrementalMessage ? (
              <p className="organization-muted" role="status">
                {incrementalMessage}
              </p>
            ) : null}
          </section>
          {result.tracks.length ? (
            <>
              <div className="desktop-scan-toolbar">
                <label>
                  {t("Buscar en el escaneo")}
                  <input
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder={t("Título, artista, carpeta, BPM…")}
                    type="search"
                    value={query}
                  />
                </label>
                <label>
                  {t("Mostrar")}
                  <select
                    onChange={(event) => {
                      setFilter(event.target.value as ScanReviewFilter);
                      setPage(1);
                    }}
                    value={filter}
                  >
                    <option value="all">{t("Todas las pistas")}</option>
                    <option value="duplicates">{t("Solo duplicados")}</option>
                    <option value="metadata-errors">{t("Sin metadatos legibles")}</option>
                  </select>
                </label>
                <button
                  className="button button--secondary"
                  disabled={!pagination.items.length}
                  onClick={toggleVisibleTracks}
                  type="button"
                >
                  {allVisibleSelected
                    ? t("Deseleccionar página")
                    : t("Seleccionar página")}
                </button>
              </div>

              <p className="organization-muted" role="status">
                {filteredTracks.length.toLocaleString(locale)}{" "}
                {locale === "en" ? "results" : "resultados"} ·{" "}
                {selectedTrackIds.size.toLocaleString(locale)}{" "}
                {locale === "en" ? "selected" : "seleccionados"}.{" "}
                {locale === "en"
                  ? "The selection stays only in this window and does not make file changes yet."
                  : "La selección permanece solo en esta ventana y todavía no ejecuta cambios en los archivos."}
              </p>

              {pagination.items.length ? (
                <ul className="available-track-list desktop-scan-results">
                  {pagination.items.map((track) => (
                    <li key={track.scanId}>
                      <label className="desktop-track-selection">
                        <input
                          aria-label={format("Seleccionar {name}", {
                            name: track.title ?? track.name,
                          })}
                          checked={selectedTrackIds.has(track.scanId)}
                          onChange={() => toggleTrack(track.scanId)}
                          type="checkbox"
                        />
                      </label>
                      <div>
                        <strong>{track.title ?? track.name}</strong>
                        <span>{formatTrackIdentity(track)}</span>
                      </div>
                      <span>
                        {linkedScanIds.has(track.scanId)
                          ? `${t("En tu biblioteca ·")} `
                          : ""}
                        {track.duplicateGroup
                          ? `${locale === "en" ? "Local duplicate" : "Duplicado local"} · ${track.duplicateGroup} · `
                          : ""}
                        {formatTrackDetails(locale, track)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="organization-muted">
                  {t("Ninguna pista coincide con esta búsqueda y filtro.")}
                </p>
              )}

              {pagination.totalPages > 1 ? (
                <nav
                  aria-label={t("Paginación del escaneo")}
                  className="desktop-scan-pagination"
                >
                  <button
                    className="button button--secondary"
                    disabled={pagination.page === 1}
                    onClick={() => setPage((current) => current - 1)}
                    type="button"
                  >
                    {t("Anterior")}
                  </button>
                  <span>
                    {format("Página {page} de {pages}", {
                      page: pagination.page.toLocaleString(locale),
                      pages: pagination.totalPages.toLocaleString(locale),
                    })}
                  </span>
                  <button
                    className="button button--secondary"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    type="button"
                  >
                    {t("Siguiente")}
                  </button>
                </nav>
              ) : null}

              {selectedTracks.length ? (
                <section
                  aria-labelledby="metadata-write-title"
                  className="desktop-metadata-editor"
                >
                  <div className="organization-section-heading">
                    <div>
                      <p className="eyebrow">{t("Etiquetas locales reversibles")}</p>
                      <h3 id="metadata-write-title">
                        {t("Escribir metadatos en archivos")}
                      </h3>
                    </div>
                    <span>
                      {t("Máximo")} {MAX_METADATA_WRITE_TRACKS} {t("pistas por lote")}
                    </span>
                  </div>
                  {selectedTracks.length > MAX_METADATA_WRITE_TRACKS ? (
                    <p className="form-message form-message--error" role="status">
                      {locale === "en"
                        ? `Reduce the selection to ${MAX_METADATA_WRITE_TRACKS} tracks to review each change and keep the backup manageable.`
                        : `Reduce la selección a ${MAX_METADATA_WRITE_TRACKS} pistas para revisar cada cambio y mantener manejable la copia de seguridad.`}
                    </p>
                  ) : (
                    <>
                      <p className="organization-muted">
                        {t("Edita únicamente los campos que quieras guardar. La previsualización no modifica nada; al confirmar, Rust comprueba cambios externos, copia cada archivo completo, escribe el lote y relee las etiquetas para verificarlo.")}
                      </p>
                      <div className="metadata-editor-list">
                        {selectedTracks.map((track) => {
                          const draft =
                            metadataDrafts[track.scanId] ??
                            metadataDraftFromTrack(track);
                          const bpmValue = draft.bpm.trim()
                            ? Number(draft.bpm.replace(",", "."))
                            : null;
                          const bpmInvalid =
                            bpmValue !== null &&
                            (!Number.isFinite(bpmValue) ||
                              bpmValue < 20 ||
                              bpmValue > 300);
                          return (
                            <fieldset key={track.scanId}>
                              <legend>{track.title ?? track.name}</legend>
                              <small>{track.relativePath}</small>
                              <div className="metadata-editor-grid">
                                <label className="field">
                                  {t("Título")}
                                  <input
                                    maxLength={300}
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "title",
                                        event.target.value,
                                      )
                                    }
                                    value={draft.title}
                                  />
                                </label>
                                <label className="field">
                                  {t("Artista")}
                                  <input
                                    maxLength={300}
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "artist",
                                        event.target.value,
                                      )
                                    }
                                    value={draft.artist}
                                  />
                                </label>
                                <label className="field">
                                  {t("Álbum")}
                                  <input
                                    maxLength={300}
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "album",
                                        event.target.value,
                                      )
                                    }
                                    value={draft.album}
                                  />
                                </label>
                                <label className="field">
                                  {t("Género")}
                                  <input
                                    maxLength={120}
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "genre",
                                        event.target.value,
                                      )
                                    }
                                    value={draft.genre}
                                  />
                                </label>
                                <label className="field">
                                  BPM
                                  <input
                                    aria-invalid={bpmInvalid}
                                    inputMode="decimal"
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "bpm",
                                        event.target.value,
                                      )
                                    }
                                    placeholder="20–300"
                                    value={draft.bpm}
                                  />
                                </label>
                                <label className="field">
                                  {t("Tonalidad")}
                                  <input
                                    maxLength={24}
                                    onChange={(event) =>
                                      updateMetadataDraft(
                                        track.scanId,
                                        "musicalKey",
                                        event.target.value,
                                      )
                                    }
                                    placeholder={t("Am o 8A")}
                                    value={draft.musicalKey}
                                  />
                                </label>
                              </div>
                              {bpmInvalid ? (
                                <span className="field-error">
                                  {t("El BPM debe estar entre 20 y 300.")}
                                </span>
                              ) : null}
                            </fieldset>
                          );
                        })}
                      </div>
                      <div className="action-row">
                        <button
                          className="button button--secondary"
                          disabled={
                            metadataBusy || !metadataSelectionIsValid()
                          }
                          onClick={() => void runMetadataWrite(false)}
                          type="button"
                        >
                          {metadataBusy
                            ? t("Verificando…")
                            : t("Previsualizar cambios")}
                        </button>
                        <button
                          className="button button--primary"
                          disabled={
                            metadataBusy || !metadataPreview?.files.length
                          }
                          onClick={() => void runMetadataWrite(true)}
                          type="button"
                        >
                          {t("Escribir con copia de seguridad")}
                        </button>
                        {lastMetadataRunId ? (
                          <button
                            className="button button--secondary"
                            disabled={metadataBusy}
                            onClick={() => void undoLastMetadataWrite()}
                            type="button"
                          >
                            {t("Deshacer última escritura")}
                          </button>
                        ) : null}
                      </div>
                      {metadataMessage ? (
                        <p className="organization-muted" role="status">
                          {metadataMessage}
                        </p>
                      ) : null}
                      {metadataPreview?.files.length ? (
                        <div className="metadata-write-preview">
                          <h4>{t("Cambios pendientes de confirmación")}</h4>
                          <ol>
                            {metadataPreview.files.map((file) => (
                              <li key={file.scanId}>
                                <strong>{file.relativePath}</strong>
                                <ul>
                                  {file.changes.map((change) => (
                                    <li key={change.field}>
                                      <span>
                                        {metadataFieldLabel(locale, change.field)}
                                      </span>
                                      <span>
                                        {metadataDisplayValue(locale, change.before)} →{" "}
                                        {metadataDisplayValue(locale, change.after)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                      {metadataHistory.length ? (
                        <ol
                          aria-label={t("Historial de escritura de metadatos")}
                          className="reorganization-history"
                        >
                          {metadataHistory.map((entry) => (
                            <li key={entry.runId}>
                              <span>
                                {new Date(entry.createdAt * 1000).toLocaleString(
                                  locale,
                                )}
                              </span>
                              <strong>
                                {entry.fileCount} {t("archivos")}
                                {entry.undone ? ` · ${t("restaurados")}` : ""}
                              </strong>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {selectedTracks.length ? (
                <section
                  aria-labelledby="virtualdj-export-title"
                  className="desktop-reorganization-preview desktop-virtualdj-export"
                >
                  <div className="organization-section-heading">
                    <div>
                      <p className="eyebrow">VirtualDJ</p>
                      <h3 id="virtualdj-export-title">{t("Exportar lista")}</h3>
                    </div>
                    <label>
                      {t("Nombre de la lista")}
                      <input
                        maxLength={120}
                        onChange={(event) =>
                          setVirtualDjListName(event.target.value)
                        }
                        value={virtualDjListName}
                      />
                    </label>
                  </div>
                  <p className="organization-muted">
                    {locale === "en"
                      ? `Native XML is the recommended option for VirtualDJ 2024+. M3U8 maintains compatibility with legacy workflows. Both formats preserve the order of the ${selectedTracks.length.toLocaleString(locale)} tracks and never copy or modify audio.`
                      : `El XML nativo es la opción recomendada para VirtualDJ 2024+. M3U8 mantiene compatibilidad con flujos heredados. Ambos formatos conservan el orden de las ${selectedTracks.length.toLocaleString(locale)} pistas y nunca copian ni modifican el audio.`}
                  </p>
                  <div className="action-row">
                    <button
                      className="button button--secondary"
                      disabled={
                        Boolean(exportingVirtualDj) || !virtualDjListName.trim()
                      }
                      onClick={() => void exportToVirtualDj("xml")}
                      type="button"
                    >
                      {exportingVirtualDj === "xml"
                        ? t("Preparando XML…")
                        : t("Guardar XML nativo")}
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={
                        Boolean(exportingVirtualDj) || !virtualDjListName.trim()
                      }
                      onClick={() => void exportToVirtualDj("m3u8")}
                      type="button"
                    >
                      {exportingVirtualDj === "m3u8"
                        ? t("Preparando M3U8…")
                        : t("Guardar M3U8 compatible")}
                    </button>
                    <button
                      className="button button--primary"
                      disabled={!desktopCrates.length}
                      onClick={() => void exportCratesToVirtualDj()}
                      type="button"
                    >
                      {locale === "en" ? "Export" : "Exportar"}{" "}
                      {desktopCrates.length}{" "}
                      {locale === "en" ? "crates and hierarchies" : "crates y jerarquías"}
                    </button>
                    <button
                      className="button button--secondary"
                      onClick={() => void importVirtualDjLists()}
                      type="button"
                    >
                      {t("Previsualizar cambios de My Lists")}
                    </button>
                  </div>
                  {virtualDjMessage ? (
                    <p className="organization-muted" role="status">
                      {virtualDjMessage}
                    </p>
                  ) : null}
                  {virtualDjImport?.lists.length ? (
                    <div className="virtualdj-reconciliation">
                      <h4>{t("Reconciliación pendiente de revisión")}</h4>
                      <ul>
                        {virtualDjImport.lists.map((list) => (
                          <li key={list.relativePath}>
                            <div>
                              <strong>{list.name}</strong>
                              <span>
                                {list.linkedTrackIds.length} {t("pistas vinculadas")} ·{" "}
                                {list.unresolvedPaths.length} {t("sin resolver")}
                              </span>
                              <small>{list.relativePath}</small>
                            </div>
                            <div className="action-row">
                              <button
                                className="button button--secondary"
                                disabled={reconcilingList === list.relativePath}
                                onClick={() =>
                                  void reconcileVirtualDjList(list, "merge")
                                }
                                type="button"
                              >
                                {t("Combinar con crate")}
                              </button>
                              <button
                                className="button button--danger"
                                disabled={reconcilingList === list.relativePath}
                                onClick={() =>
                                  void reconcileVirtualDjList(list, "replace")
                                }
                                type="button"
                              >
                                {t("Reemplazar crate")}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <p className="organization-muted">
                        {t("La importación solo propone cambios. Las pistas sin vínculo y los movimientos conflictivos deben revisarse antes de aplicar cualquier actualización al crate.")}
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {organizationPreview.length ? (
                <section
                  aria-labelledby="desktop-plan-title"
                  className="desktop-reorganization-preview"
                >
                  <div className="organization-section-heading">
                    <div>
                      <p className="eyebrow">{t("Reorganización reversible")}</p>
                      <h3 id="desktop-plan-title">{t("Plan de organización")}</h3>
                    </div>
                    <label>
                      {t("Agrupar por")}
                      <select
                        onChange={(event) =>
                          setOrganizationScheme(
                            event.target.value as OrganizationScheme,
                          )
                        }
                        value={organizationScheme}
                      >
                        <option value="artist-album">{t("Artista / álbum")}</option>
                        <option value="genre-artist">{t("Género / artista")}</option>
                        <option value="key-bpm">{t("Tonalidad / BPM")}</option>
                      </select>
                    </label>
                  </div>
                  <p className="organization-muted">
                    {locale === "en"
                      ? `These paths are a safe proposal for ${organizationPreview.length.toLocaleString(locale)} tracks. The native simulation rechecks external changes and collisions immediately before applying the batch.`
                      : `Estas rutas son una propuesta segura para ${organizationPreview.length.toLocaleString(locale)} pistas. La simulación nativa vuelve a comprobar cambios externos y colisiones justo antes de aplicar el lote.`}
                  </p>
                  <ol>
                    {organizationPreview.slice(0, 10).map((item) => (
                      <li key={item.targetPath}>
                        <span>{item.sourcePath}</span>
                        <strong>→ {item.targetPath}</strong>
                        {item.collisionResolved ? (
                          <small>{t("Nombre ajustado para evitar una colisión")}</small>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {organizationPreview.length > 10 ? (
                    <p className="organization-muted">
                      {locale === "en"
                        ? `Showing 10 of ${organizationPreview.length.toLocaleString(locale)} proposed paths.`
                        : `Se muestran 10 de ${organizationPreview.length.toLocaleString(locale)} rutas propuestas.`}
                    </p>
                  ) : null}
                  <div className="action-row">
                    <button
                      className="button button--secondary"
                      disabled={reorganizationBusy}
                      onClick={() => void runReorganization(false)}
                      type="button"
                    >
                      {t("Ejecutar simulación final")}
                    </button>
                    <button
                      className="button button--primary"
                      disabled={reorganizationBusy}
                      onClick={() => void runReorganization(true)}
                      type="button"
                    >
                      {reorganizationBusy
                        ? t("Verificando…")
                        : t("Aplicar plan con historial")}
                    </button>
                    {lastReorganizationRunId ? (
                      <button
                        className="button button--secondary"
                        disabled={reorganizationBusy}
                        onClick={() => void undoLastReorganization()}
                        type="button"
                      >
                        {t("Deshacer última reorganización")}
                      </button>
                    ) : null}
                  </div>
                  {reorganizationMessage ? (
                    <p className="organization-muted" role="status">
                      {reorganizationMessage}
                    </p>
                  ) : null}
                  {reorganizationHistory.length ? (
                    <ol
                      aria-label={t("Historial de reorganización")}
                      className="reorganization-history"
                    >
                      {reorganizationHistory.map((entry) => (
                        <li key={entry.runId}>
                          <span>
                            {new Date(entry.createdAt * 1000).toLocaleString(
                              locale,
                            )}
                          </span>
                          <strong>
                            {entry.moveCount} {t("movimientos")}
                            {entry.undone ? ` · ${t("deshechos")}` : ""}
                          </strong>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : (
            <p className="organization-muted">
              {t("No se encontraron formatos de audio compatibles en esta carpeta.")}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
