"use client";

import { useRef, useState } from "react";
import {
  saveImportedTracksAction,
  type ImportResult,
} from "@/app/import/actions";
import { Button } from "@/components/ui/button";
import {
  importValidationMessage,
  type ImportTrackInput,
} from "@/lib/import/import-schema";
import { metadataToImportTrack } from "@/lib/import/metadata";

type ImportStatus =
  | "reading"
  | "ready"
  | "invalid"
  | "saving"
  | "saved"
  | "error";

type ImportItem = {
  data?: ImportTrackInput;
  error?: string;
  id: string;
  name: string;
  status: ImportStatus;
};

const ACCEPTED_EXTENSIONS = new Set([
  "aac",
  "aif",
  "aiff",
  "ape",
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "ogg",
  "opus",
  "wav",
  "webm",
  "wma",
]);

function isAudioFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.startsWith("audio/") || ACCEPTED_EXTENSIONS.has(extension);
}

function chunks<T>(items: T[], size: number) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

function statusLabel(status: ImportStatus) {
  const labels: Record<ImportStatus, string> = {
    error: "Error al guardar",
    invalid: "Requiere revisión",
    reading: "Leyendo etiquetas",
    ready: "Lista para guardar",
    saved: "Guardada",
    saving: "Guardando",
  };
  return labels[status];
}

export function AudioImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const readyCount = items.filter((item) => item.status === "ready").length;
  const savedCount = items.filter((item) => item.status === "saved").length;

  function updateItem(id: string, update: Partial<ImportItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  async function readFile(file: File, id: string) {
    if (!isAudioFile(file)) {
      updateItem(id, {
        error: "El formato del archivo no parece ser de audio.",
        status: "invalid",
      });
      return;
    }

    try {
      const { parseBlob } = await import("music-metadata");
      const metadata = await parseBlob(file, {
        duration: true,
        skipCovers: true,
      });
      const data = metadataToImportTrack(metadata, file, id);
      const error = importValidationMessage(data);
      updateItem(id, {
        data,
        error: error ?? undefined,
        status: error ? "invalid" : "ready",
      });
    } catch {
      updateItem(id, {
        error: "No se pudieron leer las etiquetas de este archivo.",
        status: "invalid",
      });
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setNotice(null);

    const selected = Array.from(files).slice(0, 100);
    if (files.length > 100) {
      setNotice("Se procesaron los primeros 100 archivos seleccionados.");
    }

    const pending = selected.map((file) => ({
      file,
      item: {
        id: crypto.randomUUID(),
        name: file.name,
        status: "reading" as const,
      },
    }));

    setItems((current) => [...current, ...pending.map(({ item }) => item)]);
    setIsReading(true);
    const queue = [...pending];
    const workerCount = Math.min(4, queue.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        let next = queue.shift();
        while (next) {
          await readFile(next.file, next.item.id);
          next = queue.shift();
        }
      }),
    );
    setIsReading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function updateField(
    id: string,
    field: keyof ImportTrackInput,
    value: string | number | null,
  ) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id || !item.data) return item;
        const data = { ...item.data, [field]: value };
        const error = importValidationMessage(data);
        return {
          ...item,
          data,
          error: error ?? undefined,
          status: error ? "invalid" : "ready",
        };
      }),
    );
  }

  async function saveReadyTracks() {
    const ready = items.filter(
      (item): item is ImportItem & { data: ImportTrackInput } =>
        item.status === "ready" && Boolean(item.data),
    );
    if (!ready.length) return;

    setIsSaving(true);
    setNotice(null);
    const ids = new Set(ready.map((item) => item.id));
    setItems((current) =>
      current.map((item) =>
        ids.has(item.id) ? { ...item, status: "saving" } : item,
      ),
    );

    try {
      for (const group of chunks(ready, 25)) {
        try {
          const response = await saveImportedTracksAction(
            group.map((item) => item.data),
          );

          if (response.message && response.results.length === 0) {
            const groupIds = new Set(group.map((item) => item.id));
            setItems((current) =>
              current.map((item) =>
                groupIds.has(item.id)
                  ? { ...item, error: response.message, status: "error" }
                  : item,
              ),
            );
            continue;
          }

          const resultById = new Map<string, ImportResult>(
            response.results.map((result) => [result.client_id, result]),
          );
          setItems((current) =>
            current.map((item) => {
              const result = resultById.get(item.id);
              if (!result) return item;
              return {
                ...item,
                error: result.message,
                status: result.status,
              };
            }),
          );
        } catch {
          const groupIds = new Set(group.map((item) => item.id));
          setItems((current) =>
            current.map((item) =>
              groupIds.has(item.id)
                ? {
                    ...item,
                    error: "Se perdió la conexión. Puedes reintentar esta pista.",
                    status: "error",
                  }
                : item,
            ),
          );
        }
      }

      setNotice(
        "Importación terminada. Los errores pueden corregirse y reintentarse.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="import-flow" aria-busy={isReading || isSaving}>
      <div className="card import-dropzone">
        <div>
          <p className="eyebrow">Importación privada</p>
          <h2>El audio no sale de este dispositivo</h2>
          <p>
            DJOrganizer solo enviará a Supabase los campos que revises debajo.
            No sube audio ni portadas y no analiza BPM o tonalidad.
          </p>
        </div>
        <input
          ref={inputRef}
          accept="audio/*,.aac,.aif,.aiff,.ape,.flac,.m4a,.mp3,.mp4,.ogg,.opus,.wav,.webm,.wma"
          className="visually-hidden"
          disabled={isReading || isSaving}
          id="audio-files"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          type="file"
        />
        <label className="button button--primary" htmlFor="audio-files">
          {isReading ? "Leyendo archivos…" : "Seleccionar archivos"}
        </label>
      </div>

      {notice ? (
        <p className="form-message form-message--success" role="status">
          {notice}
        </p>
      ) : null}

      {items.length ? (
        <>
          <div className="import-toolbar">
            <p>
              <strong>{items.length}</strong> archivos · {readyCount} listos ·{" "}
              {savedCount} guardados
            </p>
            <Button
              disabled={!readyCount || isSaving || isReading}
              onClick={() => void saveReadyTracks()}
              type="button"
            >
              {isSaving ? "Guardando…" : `Guardar ${readyCount} pistas`}
            </Button>
          </div>

          <div className="import-list">
            {items.map((item) => {
              const isLocked =
                item.status === "saving" || item.status === "saved";

              return (
                <article className="card import-item" key={item.id}>
                <header>
                  <div>
                    <strong>{item.name}</strong>
                    <span className={`import-status import-status--${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <button
                    aria-label={`Quitar ${item.name}`}
                    className="import-remove"
                    disabled={item.status === "saving"}
                    onClick={() => removeItem(item.id)}
                    type="button"
                  >
                    Quitar
                  </button>
                </header>

                {item.data ? (
                  <div className="import-grid">
                    <label className="field">
                      Título
                      <input
                        disabled={isLocked}
                        maxLength={300}
                        onChange={(event) =>
                          updateField(item.id, "title", event.target.value)
                        }
                        required
                        value={item.data.title}
                      />
                    </label>
                    <label className="field">
                      Artista
                      <input
                        disabled={isLocked}
                        maxLength={300}
                        onChange={(event) =>
                          updateField(item.id, "artist", event.target.value)
                        }
                        required
                        value={item.data.artist}
                      />
                    </label>
                    <label className="field">
                      Álbum
                      <input
                        disabled={isLocked}
                        maxLength={300}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "album",
                            event.target.value || null,
                          )
                        }
                        value={item.data.album ?? ""}
                      />
                    </label>
                    <label className="field">
                      Género
                      <input
                        disabled={isLocked}
                        maxLength={120}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "genre",
                            event.target.value || null,
                          )
                        }
                        value={item.data.genre ?? ""}
                      />
                    </label>
                    <label className="field">
                      BPM de etiqueta
                      <input
                        disabled={isLocked}
                        max={300}
                        min={20}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "bpm",
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={item.data.bpm ?? ""}
                      />
                    </label>
                    <label className="field">
                      Tonalidad de etiqueta
                      <input
                        disabled={isLocked}
                        maxLength={16}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "musical_key",
                            event.target.value || null,
                          )
                        }
                        value={item.data.musical_key ?? ""}
                      />
                    </label>
                    <label className="field">
                      Año
                      <input
                        disabled={isLocked}
                        max={2100}
                        min={1000}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "release_year",
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                        type="number"
                        value={item.data.release_year ?? ""}
                      />
                    </label>
                    <label className="field">
                      Duración (segundos)
                      <input
                        disabled
                        value={item.data.duration_seconds ?? ""}
                      />
                    </label>
                  </div>
                ) : null}

                {item.error ? (
                  <p className="field-error" role="alert">
                    {item.error}
                  </p>
                ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card import-empty">
          <p>Selecciona hasta 100 archivos para preparar una importación.</p>
          <small>
            Formatos habituales: MP3, M4A, FLAC, WAV, AIFF, AAC, OGG y Opus.
          </small>
        </div>
      )}
    </section>
  );
}

