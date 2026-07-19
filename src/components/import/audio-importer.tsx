"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  checkImportDuplicatesAction,
  saveImportedTracksAction,
  type ImportResult,
} from "@/app/import/actions";
import { Button } from "@/components/ui/button";
import {
  detectBpmFromAudioBuffer,
  detectBpmFromFile,
} from "@/lib/import/bpm-detector";
import { duplicateClientIds } from "@/lib/import/duplicates";
import { fingerprintBlob } from "@/lib/import/fingerprint";
import {
  importValidationMessage,
  type ImportTrackInput,
} from "@/lib/import/import-schema";
import {
  detectKeyFromAudioBuffer,
  detectKeyFromFile,
} from "@/lib/import/key-detector";
import { metadataToImportTrack } from "@/lib/import/metadata";

type ImportStatus =
  | "reading"
  | "fingerprinting"
  | "checking"
  | "ready"
  | "invalid"
  | "saving"
  | "saved"
  | "duplicate"
  | "error";

type AutomaticAnalysisProgress = {
  completed: number;
  total: number;
};

type ImportItem = {
  bpmError?: string;
  bpmStatus?: "idle" | "analyzing" | "detected" | "error";
  data?: ImportTrackInput;
  duplicateTrackId?: string;
  error?: string;
  file?: File;
  id: string;
  keyError?: string;
  keyStatus?: "idle" | "analyzing" | "detected" | "error";
  name: string;
  progress?: number;
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
    checking: "Comprobando",
    duplicate: "Duplicada",
    error: "Error al guardar",
    fingerprinting: "Calculando huella",
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
  const automaticAnalysisRunRef = useRef(0);
  const automaticAudioContextRef = useRef<AudioContext | null>(null);
  const [automaticAnalysisProgress, setAutomaticAnalysisProgress] =
    useState<AutomaticAnalysisProgress | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isAnalyzingKey, setIsAnalyzingKey] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAnalyzingBpm, setIsAnalyzingBpm] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const readyCount = items.filter((item) => item.status === "ready").length;
  const savedCount = items.filter((item) => item.status === "saved").length;
  const duplicateCount = items.filter(
    (item) => item.status === "duplicate",
  ).length;
  function updateItem(id: string, update: Partial<ImportItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  async function readFile(file: File, id: string): Promise<ImportItem> {
    if (!isAudioFile(file)) {
      const item: ImportItem = {
        error: "El formato del archivo no parece ser de audio.",
        id,
        name: file.name,
        status: "invalid",
      };
      updateItem(id, item);
      return item;
    }

    updateItem(id, { progress: 0, status: "fingerprinting" });

    try {
      const metadataPromise = import("music-metadata").then(({ parseBlob }) =>
        parseBlob(file, {
          duration: true,
          skipCovers: true,
        }),
      );
      const fingerprintPromise = fingerprintBlob(file, (progress) =>
        updateItem(id, { progress }),
      );
      const [metadata, fingerprint] = await Promise.all([
        metadataPromise,
        fingerprintPromise,
      ]);
      const data = metadataToImportTrack(metadata, file, id, fingerprint);
      const error = importValidationMessage(data);
      const item: ImportItem = {
        bpmStatus: "idle",
        data,
        error: error ?? undefined,
        file,
        id,
        keyStatus: "idle",
        name: file.name,
        progress: 100,
        status: error ? "invalid" : "ready",
      };
      updateItem(id, item);
      return item;
    } catch {
      const item: ImportItem = {
        error: "No se pudieron leer las etiquetas de este archivo.",
        id,
        name: file.name,
        status: "invalid",
      };
      updateItem(id, item);
      return item;
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
    const completed = new Map<string, ImportItem>();
    const workerCount = Math.min(4, queue.length);

    let automaticTargets: ImportItem[] = [];

    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          let next = queue.shift();
          while (next) {
            const item = await readFile(next.file, next.item.id);
            completed.set(item.id, item);
            next = queue.shift();
          }
        }),
      );

      const completedItems = pending.flatMap(({ item }) => {
        const result = completed.get(item.id);
        return result ? [result] : [];
      });
      const pendingIds = new Set(pending.map(({ item }) => item.id));
      const fingerprinted = [
        ...items.flatMap((item) => (item.data ? [item.data] : [])),
        ...completedItems.flatMap((item) => (item.data ? [item.data] : [])),
      ];
      const localDuplicateIds = new Set(duplicateClientIds(fingerprinted));
      const excludedFromAnalysis = new Set(localDuplicateIds);

      setItems((current) =>
        current.map((item) => {
          if (!pendingIds.has(item.id) || !item.data) return item;
          if (localDuplicateIds.has(item.id)) {
            return {
              ...item,
              error: "Este archivo coincide con otro de esta selección.",
              status: "duplicate",
            };
          }
          return item.status === "ready"
            ? { ...item, status: "checking" }
            : item;
        }),
      );

      const fingerprints = completedItems.flatMap((item) =>
        item.data ? [item.data.file_fingerprint] : [],
      );

      if (fingerprints.length) {
        try {
          const response = await checkImportDuplicatesAction(fingerprints);
          const serverDuplicates = new Map(
            response.duplicates.map((duplicate) => [
              duplicate.file_fingerprint,
              duplicate,
            ]),
          );
          for (const item of completedItems) {
            if (
              item.data &&
              serverDuplicates.has(item.data.file_fingerprint)
            ) {
              excludedFromAnalysis.add(item.id);
            }
          }

          setItems((current) =>
            current.map((item) => {
              if (!pendingIds.has(item.id) || !item.data) return item;
              if (localDuplicateIds.has(item.id)) {
                return {
                  ...item,
                  error: "Este archivo coincide con otro de esta selección.",
                  status: "duplicate",
                };
              }

              const duplicate = serverDuplicates.get(
                item.data.file_fingerprint,
              );
              if (duplicate) {
                return {
                  ...item,
                  duplicateTrackId: duplicate.track_id,
                  error: `Ya existe en tu biblioteca: “${duplicate.title}”.`,
                  status: "duplicate",
                };
              }

              return item.status === "checking"
                ? { ...item, error: undefined, status: "ready" }
                : item;
            }),
          );

          if (response.message) setNotice(response.message);
        } catch {
          setItems((current) =>
            current.map((item) =>
              pendingIds.has(item.id) && item.status === "checking"
                ? { ...item, status: "ready" }
                : item,
            ),
          );
          setNotice(
            "No se pudo comprobar la biblioteca. Se volverá a comprobar al guardar.",
          );
        }
      }

      automaticTargets = completedItems.filter(
        (item) =>
          (item.status === "ready" || item.status === "invalid") &&
          !excludedFromAnalysis.has(item.id) &&
          Boolean(item.data) &&
          Boolean(item.file),
      );
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }

    await analyzeAutomatically(automaticTargets);
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
          bpmError: field === "bpm" ? undefined : item.bpmError,
          bpmStatus: field === "bpm" ? "idle" : item.bpmStatus,
          data,
          error: error ?? undefined,
          keyError: field === "musical_key" ? undefined : item.keyError,
          keyStatus:
            field === "musical_key" ? "idle" : item.keyStatus,
          status: error ? "invalid" : "ready",
        };
      }),
    );
  }


  function cancelAutomaticAnalysis() {
    automaticAnalysisRunRef.current += 1;
    const audioContext = automaticAudioContextRef.current;
    automaticAudioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    setItems((current) =>
      current.map((item) => ({
        ...item,
        bpmStatus: item.bpmStatus === "analyzing" ? "idle" : item.bpmStatus,
        keyStatus: item.keyStatus === "analyzing" ? "idle" : item.keyStatus,
      })),
    );
    setAutomaticAnalysisProgress(null);
    setIsAnalyzingBpm(false);
    setIsAnalyzingKey(false);
    setNotice(
      "Análisis automático cancelado. Puedes reintentar cada pista o completar los datos manualmente.",
    );
  }

  async function analyzeAutomatically(targets: ImportItem[]) {
    const analyzable = targets.filter(
      (item): item is ImportItem & {
        data: ImportTrackInput;
        file: File;
      } =>
        (item.status === "ready" || item.status === "invalid") &&
        Boolean(item.data) &&
        Boolean(item.file) &&
        (item.data?.bpm === null || item.data?.musical_key === null),
    );
    if (!analyzable.length) return;

    const runId = automaticAnalysisRunRef.current + 1;
    automaticAnalysisRunRef.current = runId;
    const analyzesBpm = analyzable.some((item) => item.data.bpm === null);
    const analyzesKey = analyzable.some(
      (item) => item.data.musical_key === null,
    );
    const bpmTargetIds = new Set(
      analyzable
        .filter((item) => item.data.bpm === null)
        .map((item) => item.id),
    );
    const keyTargetIds = new Set(
      analyzable
        .filter((item) => item.data.musical_key === null)
        .map((item) => item.id),
    );
    setItems((current) =>
      current.map((item) => ({
        ...item,
        bpmError: bpmTargetIds.has(item.id) ? undefined : item.bpmError,
        bpmStatus: bpmTargetIds.has(item.id)
          ? "analyzing"
          : item.bpmStatus,
        keyError: keyTargetIds.has(item.id) ? undefined : item.keyError,
        keyStatus: keyTargetIds.has(item.id)
          ? "analyzing"
          : item.keyStatus,
      })),
    );
    setIsAnalyzingBpm(analyzesBpm);
    setIsAnalyzingKey(analyzesKey);
    setAutomaticAnalysisProgress({
      completed: 0,
      total: analyzable.length,
    });
    setNotice(
      "Analizando automáticamente BPM y tonalidad en este dispositivo…",
    );

    let audioContext: AudioContext | null = null;

    try {
      audioContext = new AudioContext();
      automaticAudioContextRef.current = audioContext;
      await audioContext.resume();

      for (const [index, item] of analyzable.entries()) {
        if (automaticAnalysisRunRef.current !== runId) break;

        const shouldAnalyzeBpm = item.data.bpm === null;
        const shouldAnalyzeKey = item.data.musical_key === null;
        updateItem(item.id, {
          bpmError: shouldAnalyzeBpm ? undefined : item.bpmError,
          bpmStatus: shouldAnalyzeBpm ? "analyzing" : item.bpmStatus,
          keyError: shouldAnalyzeKey ? undefined : item.keyError,
          keyStatus: shouldAnalyzeKey ? "analyzing" : item.keyStatus,
        });

        try {
          const audioBuffer = await audioContext.decodeAudioData(
            await item.file.arrayBuffer(),
          );
          if (automaticAnalysisRunRef.current !== runId) break;

          const [bpmResult, keyResult] = await Promise.allSettled([
            shouldAnalyzeBpm
              ? detectBpmFromAudioBuffer(audioBuffer)
              : Promise.resolve(null),
            shouldAnalyzeKey
              ? detectKeyFromAudioBuffer(audioBuffer)
              : Promise.resolve(null),
          ]);
          if (automaticAnalysisRunRef.current !== runId) break;

          setItems((current) =>
            current.map((currentItem) => {
              if (currentItem.id !== item.id || !currentItem.data) {
                return currentItem;
              }

              let data = currentItem.data;
              let bpmError = currentItem.bpmError;
              let bpmStatus = currentItem.bpmStatus;
              let keyError = currentItem.keyError;
              let keyStatus = currentItem.keyStatus;

              if (shouldAnalyzeBpm) {
                if (bpmResult.status === "fulfilled" && bpmResult.value) {
                  data = { ...data, bpm: bpmResult.value };
                  bpmError = undefined;
                  bpmStatus = "detected";
                } else {
                  bpmError =
                    "No se pudo estimar el BPM. Puedes reintentarlo o escribirlo manualmente.";
                  bpmStatus = "error";
                }
              }

              if (shouldAnalyzeKey) {
                if (keyResult.status === "fulfilled" && keyResult.value) {
                  data = {
                    ...data,
                    musical_key: keyResult.value.musicalKey,
                  };
                  keyError = undefined;
                  keyStatus = "detected";
                } else {
                  keyError =
                    "No se pudo estimar la tonalidad. Puedes reintentarlo o escribirla manualmente.";
                  keyStatus = "error";
                }
              }

              const error = importValidationMessage(data);
              return {
                ...currentItem,
                bpmError,
                bpmStatus,
                data,
                error: error ?? undefined,
                keyError,
                keyStatus,
                status: error ? "invalid" : "ready",
              };
            }),
          );
        } catch {
          updateItem(item.id, {
            bpmError: shouldAnalyzeBpm
              ? "No se pudo decodificar el audio para estimar el BPM."
              : item.bpmError,
            bpmStatus: shouldAnalyzeBpm ? "error" : item.bpmStatus,
            keyError: shouldAnalyzeKey
              ? "No se pudo decodificar el audio para estimar la tonalidad."
              : item.keyError,
            keyStatus: shouldAnalyzeKey ? "error" : item.keyStatus,
          });
        }

        if (automaticAnalysisRunRef.current === runId) {
          setAutomaticAnalysisProgress({
            completed: index + 1,
            total: analyzable.length,
          });
        }
      }

      if (automaticAnalysisRunRef.current === runId) {
        setNotice(
          "Análisis automático terminado. Revisa las estimaciones antes de guardar.",
        );
      }
    } catch {
      if (automaticAnalysisRunRef.current === runId) {
        const targetIds = new Set(analyzable.map((item) => item.id));
        setItems((current) =>
          current.map((item) =>
            targetIds.has(item.id) &&
            (item.bpmStatus === "analyzing" ||
              item.keyStatus === "analyzing")
              ? {
                  ...item,
                  bpmStatus:
                    item.bpmStatus === "analyzing" ? "error" : item.bpmStatus,
                  bpmError:
                    item.bpmStatus === "analyzing"
                      ? "El navegador no pudo iniciar el análisis automático."
                      : item.bpmError,
                  keyStatus:
                    item.keyStatus === "analyzing" ? "error" : item.keyStatus,
                  keyError:
                    item.keyStatus === "analyzing"
                      ? "El navegador no pudo iniciar el análisis automático."
                      : item.keyError,
                }
              : item,
          ),
        );
        setNotice(
          "No se pudo iniciar el analizador automático en este navegador.",
        );
      }
    } finally {
      if (automaticAudioContextRef.current === audioContext) {
        automaticAudioContextRef.current = null;
      }
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close().catch(() => undefined);
      }
      if (automaticAnalysisRunRef.current === runId) {
        setAutomaticAnalysisProgress(null);
        setIsAnalyzingBpm(false);
        setIsAnalyzingKey(false);
      }
    }
  }

  async function analyzeBpm(targets: ImportItem[]) {
    const analyzable = targets.filter(
      (item): item is ImportItem & {
        data: ImportTrackInput;
        file: File;
      } =>
        item.status === "ready" &&
        Boolean(item.data) &&
        Boolean(item.file),
    );
    if (!analyzable.length) return;

    setIsAnalyzingBpm(true);
    setNotice(null);
    let audioContext: AudioContext | null = null;

    try {
      audioContext = new AudioContext();
      await audioContext.resume();

      for (const item of analyzable) {
        updateItem(item.id, {
          bpmError: undefined,
          bpmStatus: "analyzing",
        });

        try {
          const bpm = await detectBpmFromFile(item.file, audioContext);
          setItems((current) =>
            current.map((currentItem) => {
              if (currentItem.id !== item.id || !currentItem.data) {
                return currentItem;
              }

              const data = { ...currentItem.data, bpm };
              const error = importValidationMessage(data);
              return {
                ...currentItem,
                bpmError: undefined,
                bpmStatus: "detected",
                data,
                error: error ?? undefined,
                status: error ? "invalid" : "ready",
              };
            }),
          );
        } catch {
          updateItem(item.id, {
            bpmError:
              "No se pudo estimar el BPM. Puedes escribirlo manualmente.",
            bpmStatus: "error",
          });
        }
      }

      setNotice(
        "Análisis de BPM terminado. Revisa las estimaciones antes de guardar.",
      );
    } catch {
      const targetIds = new Set(analyzable.map((item) => item.id));
      setItems((current) =>
        current.map((item) =>
          targetIds.has(item.id) && item.bpmStatus === "analyzing"
            ? {
                ...item,
                bpmError:
                  "El navegador no pudo iniciar el análisis. Escribe el BPM manualmente.",
                bpmStatus: "error",
              }
            : item,
        ),
      );
      setNotice(
        "No se pudo iniciar el analizador de audio en este navegador.",
      );
    } finally {
      if (audioContext) {
        await audioContext.close().catch(() => undefined);
      }
      setIsAnalyzingBpm(false);
    }
  }

  async function analyzeKeys(targets: ImportItem[]) {
    const analyzable = targets.filter(
      (item): item is ImportItem & {
        data: ImportTrackInput;
        file: File;
      } =>
        item.status === "ready" &&
        Boolean(item.data) &&
        Boolean(item.file),
    );
    if (!analyzable.length) return;

    setIsAnalyzingKey(true);
    setNotice(null);
    let audioContext: AudioContext | null = null;

    try {
      audioContext = new AudioContext();
      await audioContext.resume();

      for (const item of analyzable) {
        updateItem(item.id, {
          keyError: undefined,
          keyStatus: "analyzing",
        });

        try {
          const result = await detectKeyFromFile(item.file, audioContext);
          setItems((current) =>
            current.map((currentItem) => {
              if (currentItem.id !== item.id || !currentItem.data) {
                return currentItem;
              }

              const data = {
                ...currentItem.data,
                musical_key: result.musicalKey,
              };
              const error = importValidationMessage(data);
              return {
                ...currentItem,
                data,
                error: error ?? undefined,
                keyError: undefined,
                keyStatus: "detected",
                status: error ? "invalid" : "ready",
              };
            }),
          );
        } catch {
          updateItem(item.id, {
            keyError:
              "No se pudo estimar la tonalidad. Puedes escribirla manualmente.",
            keyStatus: "error",
          });
        }
      }

      setNotice(
        "Análisis tonal terminado. Revisa las estimaciones antes de guardar.",
      );
    } catch {
      const targetIds = new Set(analyzable.map((item) => item.id));
      setItems((current) =>
        current.map((item) =>
          targetIds.has(item.id) && item.keyStatus === "analyzing"
            ? {
                ...item,
                keyError:
                  "El navegador no pudo iniciar el análisis. Escribe la tonalidad manualmente.",
                keyStatus: "error",
              }
            : item,
        ),
      );
      setNotice(
        "No se pudo iniciar el analizador tonal en este navegador.",
      );
    } finally {
      if (audioContext) {
        await audioContext.close().catch(() => undefined);
      }
      setIsAnalyzingKey(false);
    }
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
                duplicateTrackId: result.track_id,
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
    <section
      className="import-flow"
      aria-busy={
        isReading || isSaving || isAnalyzingBpm || isAnalyzingKey
      }
    >
      <div className="card import-dropzone">
        <div>
          <p className="eyebrow">Importación privada</p>
          <h2>El audio no sale de este dispositivo</h2>
          <p>
            DJOrganizer calcula una huella SHA-256 local para detectar archivos
            exactamente iguales y estima automáticamente BPM y tonalidad al
            seleccionarlos. El análisis ocurre en el navegador. Solo envía a
            Supabase la huella y los campos que revises; no sube audio ni
            portadas.
          </p>
        </div>
        <input
          ref={inputRef}
          accept="audio/*,.aac,.aif,.aiff,.ape,.flac,.m4a,.mp3,.mp4,.ogg,.opus,.wav,.webm,.wma"
          className="visually-hidden"
          disabled={
            isReading || isSaving || isAnalyzingBpm || isAnalyzingKey
          }
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
              {savedCount} guardados · {duplicateCount} duplicados
            </p>
            <div className="import-actions">
              {automaticAnalysisProgress ? (
                <div
                  className="import-analysis-progress"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    Analizando {automaticAnalysisProgress.completed} de{" "}
                    {automaticAnalysisProgress.total}
                  </span>
                  <progress
                    max={automaticAnalysisProgress.total}
                    value={automaticAnalysisProgress.completed}
                  />
                  <Button
                    onClick={cancelAutomaticAnalysis}
                    type="button"
                    variant="secondary"
                  >
                    Cancelar análisis
                  </Button>
                </div>
              ) : null}
              <Button
                disabled={
                  !readyCount ||
                  isSaving ||
                  isReading ||
                  isAnalyzingBpm ||
                  isAnalyzingKey
                }
                onClick={() => void saveReadyTracks()}
                type="button"
              >
                {isSaving ? "Guardando…" : `Guardar ${readyCount} pistas`}
              </Button>
            </div>
          </div>

          <div className="import-list">
            {items.map((item) => {
              const isLocked =
                item.status === "saving" ||
                item.status === "saved" ||
                item.status === "duplicate" ||
                item.bpmStatus === "analyzing" ||
                item.keyStatus === "analyzing";

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

                {item.status === "fingerprinting" ? (
                  <div className="import-progress">
                    <progress max={100} value={item.progress ?? 0} />
                    <small>{item.progress ?? 0}%</small>
                  </div>
                ) : null}

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
                    <label className="field import-bpm-field">
                      <span>
                        BPM
                        {item.bpmStatus === "detected" ? (
                          <small>Estimado localmente</small>
                        ) : null}
                      </span>
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
                      {item.file &&
                      (item.status === "ready" || item.status === "invalid") &&
                      item.bpmStatus !== "analyzing" ? (
                        <button
                          className="import-analyze-link"
                          disabled={isAnalyzingBpm || isSaving || isReading}
                          onClick={() => void analyzeBpm([item])}
                          type="button"
                        >
                          {item.data.bpm === null
                            ? "Reintentar detección"
                            : "Volver a analizar"}
                        </button>
                      ) : null}
                      {item.bpmStatus === "analyzing" ? (
                        <small role="status">Analizando el audio local…</small>
                      ) : null}
                      {item.bpmError ? (
                        <small className="field-error" role="alert">
                          {item.bpmError}
                        </small>
                      ) : null}
                    </label>
                    <label className="field import-key-field">
                      <span>
                        Tonalidad
                        {item.keyStatus === "detected" ? (
                          <small>Estimada localmente</small>
                        ) : null}
                      </span>
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
                      {item.file &&
                      (item.status === "ready" || item.status === "invalid") &&
                      item.keyStatus !== "analyzing" ? (
                        <button
                          className="import-analyze-link"
                          disabled={
                            isAnalyzingKey ||
                            isAnalyzingBpm ||
                            isSaving ||
                            isReading
                          }
                          onClick={() => void analyzeKeys([item])}
                          type="button"
                        >
                          {item.data.musical_key === null
                            ? "Reintentar detección"
                            : "Volver a analizar"}
                        </button>
                      ) : null}
                      {item.keyStatus === "analyzing" ? (
                        <small role="status">Analizando armonía local…</small>
                      ) : null}
                      {item.keyError ? (
                        <small className="field-error" role="alert">
                          {item.keyError}
                        </small>
                      ) : null}
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
                    {item.error}{" "}
                    {item.duplicateTrackId ? (
                      <Link href={`/library/${item.duplicateTrackId}`}>
                        Ver la pista
                      </Link>
                    ) : null}
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

