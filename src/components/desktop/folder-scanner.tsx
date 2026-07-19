"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterScannedTracks,
  paginateScannedTracks,
  type ScanReviewFilter,
  type ScannedAudioFile,
} from "@/lib/desktop/scan-review";

interface TauriCore {
  invoke<T>(command: string): Promise<T>;
}

interface FolderScanResult {
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

function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("es-ES", {
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

function formatTrackDetails(track: ScannedAudioFile) {
  const details: string[] = [];

  if (track.bpm !== null) {
    details.push(
      `${track.bpm.toLocaleString("es-ES", { maximumFractionDigits: 1 })} BPM`,
    );
  }
  if (track.musicalKey) details.push(track.musicalKey);
  if (track.durationSeconds !== null) {
    details.push(formatDuration(track.durationSeconds));
  }
  details.push(track.extension.toUpperCase());
  details.push(formatFileSize(track.sizeBytes));

  return details.join(" · ");
}

function formatTrackIdentity(track: ScannedAudioFile) {
  const identity = [track.artist, track.album, track.genre].filter(
    (value): value is string => Boolean(value),
  );
  return identity.length ? identity.join(" · ") : track.relativePath;
}

export function DesktopFolderScanner() {
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<FolderScanResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScanReviewFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
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
  const visiblePaths = pagination.items.map((track) => track.relativePath);
  const allVisibleSelected =
    visiblePaths.length > 0 &&
    visiblePaths.every((relativePath) => selectedPaths.has(relativePath));

  useEffect(() => {
    setDesktopAvailable(Boolean(getTauriCore()));
  }, []);

  if (!desktopAvailable) return null;

  async function chooseAndScan() {
    const core = getTauriCore();
    if (!core) return;

    setScanning(true);
    setMessage(null);

    try {
      const nextResult = await core.invoke<FolderScanResult | null>(
        "choose_and_scan_music_folder",
      );
      if (!nextResult) {
        setMessage("Selección cancelada. No se ha leído ningún archivo.");
        return;
      }

      setResult(nextResult);
      setQuery("");
      setFilter("all");
      setPage(1);
      setSelectedPaths(new Set());
    } catch {
      setMessage(
        "No se pudo leer esa carpeta. Comprueba sus permisos y vuelve a intentarlo.",
      );
    } finally {
      setScanning(false);
    }
  }

  function toggleTrack(relativePath: string) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }
      return next;
    });
  }

  function toggleVisibleTracks() {
    setSelectedPaths((current) => {
      const next = new Set(current);
      for (const relativePath of visiblePaths) {
        if (allVisibleSelected) {
          next.delete(relativePath);
        } else {
          next.add(relativePath);
        }
      }
      return next;
    });
  }

  return (
    <div className="import-flow">
      <section className="card import-dropzone" aria-labelledby="desktop-scan-title">
        <div>
          <p className="eyebrow">Aplicación de escritorio</p>
          <h2 id="desktop-scan-title">Escanear una carpeta musical</h2>
          <p>
            El selector nativo requiere una confirmación explícita. El escaneo lee
            etiquetas, propiedades técnicas y copias exactas en este dispositivo;
            no mueve, modifica, reproduce, sube ni guarda audio.
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={scanning}
          onClick={() => void chooseAndScan()}
          type="button"
        >
          {scanning ? "Leyendo y comparando…" : "Seleccionar carpeta"}
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
              <p className="eyebrow">Resultado local</p>
              <h2>{result.rootName}</h2>
            </div>
            <span>{result.tracks.length.toLocaleString("es-ES")} pistas</span>
          </div>
          <p className="organization-muted">
            Se revisaron {result.examinedEntries.toLocaleString("es-ES")} entradas
            {result.skippedEntries
              ? ` y se omitieron ${result.skippedEntries.toLocaleString("es-ES")} sin acceso`
              : ""}
            {result.metadataFailures
              ? `; ${result.metadataFailures.toLocaleString("es-ES")} pistas conservaron solo los datos del archivo`
              : ""}
            {result.duplicateGroups
              ? `; ${result.duplicateTracks.toLocaleString("es-ES")} pistas forman ${result.duplicateGroups.toLocaleString("es-ES")} grupos de copias exactas`
              : "; no se detectaron copias exactas"}
            {result.fingerprintFailures
              ? `; no se pudieron comparar ${result.fingerprintFailures.toLocaleString("es-ES")} archivos`
              : ""}
            .{result.truncated ? " El resultado alcanzó el límite de seguridad." : ""}
          </p>
          {result.tracks.length ? (
            <>
              <div className="desktop-scan-toolbar">
                <label>
                  Buscar en el escaneo
                  <input
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Título, artista, carpeta, BPM…"
                    type="search"
                    value={query}
                  />
                </label>
                <label>
                  Mostrar
                  <select
                    onChange={(event) => {
                      setFilter(event.target.value as ScanReviewFilter);
                      setPage(1);
                    }}
                    value={filter}
                  >
                    <option value="all">Todas las pistas</option>
                    <option value="duplicates">Solo duplicados</option>
                    <option value="metadata-errors">Sin metadatos legibles</option>
                  </select>
                </label>
                <button
                  className="button button--secondary"
                  disabled={!pagination.items.length}
                  onClick={toggleVisibleTracks}
                  type="button"
                >
                  {allVisibleSelected
                    ? "Deseleccionar página"
                    : "Seleccionar página"}
                </button>
              </div>

              <p className="organization-muted" role="status">
                {filteredTracks.length.toLocaleString("es-ES")} resultados ·{" "}
                {selectedPaths.size.toLocaleString("es-ES")} seleccionados. La
                selección permanece solo en esta ventana y todavía no ejecuta
                cambios en los archivos.
              </p>

              {pagination.items.length ? (
                <ul className="available-track-list desktop-scan-results">
                  {pagination.items.map((track) => (
                    <li key={track.relativePath}>
                      <label className="desktop-track-selection">
                        <input
                          aria-label={`Seleccionar ${track.title ?? track.name}`}
                          checked={selectedPaths.has(track.relativePath)}
                          onChange={() => toggleTrack(track.relativePath)}
                          type="checkbox"
                        />
                      </label>
                      <div>
                        <strong>{track.title ?? track.name}</strong>
                        <span>{formatTrackIdentity(track)}</span>
                      </div>
                      <span>
                        {track.duplicateGroup
                          ? `Duplicado local · ${track.duplicateGroup} · `
                          : ""}
                        {formatTrackDetails(track)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="organization-muted">
                  Ninguna pista coincide con esta búsqueda y filtro.
                </p>
              )}

              {pagination.totalPages > 1 ? (
                <nav
                  aria-label="Paginación del escaneo"
                  className="desktop-scan-pagination"
                >
                  <button
                    className="button button--secondary"
                    disabled={pagination.page === 1}
                    onClick={() => setPage((current) => current - 1)}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span>
                    Página {pagination.page.toLocaleString("es-ES")} de{" "}
                    {pagination.totalPages.toLocaleString("es-ES")}
                  </span>
                  <button
                    className="button button--secondary"
                    disabled={pagination.page === pagination.totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    type="button"
                  >
                    Siguiente
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <p className="organization-muted">
              No se encontraron formatos de audio compatibles en esta carpeta.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
