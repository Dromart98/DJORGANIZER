"use client";

import { useEffect, useState } from "react";

interface TauriCore {
  invoke<T>(command: string): Promise<T>;
}

interface ScannedAudioFile {
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
}

interface FolderScanResult {
  rootName: string;
  tracks: ScannedAudioFile[];
  examinedEntries: number;
  skippedEntries: number;
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

export function DesktopFolderScanner() {
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<FolderScanResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
    } catch {
      setMessage(
        "No se pudo leer esa carpeta. Comprueba sus permisos y vuelve a intentarlo.",
      );
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="import-flow">
      <section className="card import-dropzone" aria-labelledby="desktop-scan-title">
        <div>
          <p className="eyebrow">Aplicación de escritorio</p>
          <h2 id="desktop-scan-title">Escanear una carpeta musical</h2>
          <p>
            El selector nativo requiere una confirmación explícita. El escaneo
            solo lee nombres, extensiones, rutas relativas y tamaños; no mueve,
            modifica, reproduce, sube ni guarda audio.
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={scanning}
          onClick={() => void chooseAndScan()}
          type="button"
        >
          {scanning ? "Escaneando…" : "Seleccionar carpeta"}
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
            .{result.truncated ? " El resultado alcanzó el límite de seguridad." : ""}
          </p>
          {result.tracks.length ? (
            <ul className="available-track-list">
              {result.tracks.slice(0, 8).map((track) => (
                <li key={track.relativePath}>
                  <div>
                    <strong>{track.name}</strong>
                    <span>{track.relativePath}</span>
                  </div>
                  <span>
                    {track.extension.toUpperCase()} · {formatFileSize(track.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="organization-muted">
              No se encontraron formatos de audio compatibles en esta carpeta.
            </p>
          )}
          {result.tracks.length > 8 ? (
            <p className="organization-muted">
              Vista previa de 8 pistas. La lista completa permanece únicamente en
              la memoria de esta ventana.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
