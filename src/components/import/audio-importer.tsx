"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  checkAcousticMatchesAction,
  checkImportDuplicatesAction,
  saveImportedTracksAction,
  type AcousticLibraryMatch,
  type ImportResult,
} from "@/app/import/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import {
  createAcousticSignature,
  inferVersionType,
} from "@/lib/audio/acoustic-similarity";
import { analyzeEnergyFromAudioBuffer } from "@/lib/audio/energy-analysis";
import { createWavClipFromAudioBuffer } from "@/lib/audio/wav-clip";
import {
  LocalGenreCancelledError,
  LocalGenreClient,
} from "@/lib/audio/local-genre/client";
import type {
  LocalGenreModelStatus,
  LocalGenreSuggestion,
} from "@/lib/audio/local-genre/types";
import { applyLocalGenreSuggestion } from "@/lib/audio/local-genre/suggestion";
import { needsLocalGenreSuggestion } from "@/lib/audio/local-genre/import-analysis";
import { isAutomaticAnalysisEligibleStatus } from "@/lib/import/automatic-analysis";
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
import {
  translate,
  translateKnown,
  type FunctionalMessage,
} from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";
import {
  loadOfflineMutations,
  saveOfflineMutations,
  type OfflineMutation,
} from "@/lib/offline/mutation-queue";

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
  acousticMatch?: AcousticLibraryMatch;
  bpmError?: string;
  bpmStatus?: "idle" | "analyzing" | "detected" | "error";
  data?: ImportTrackInput;
  duplicateTrackId?: string;
  error?: string;
  file?: File;
  genreError?: string;
  genreStatus?: "idle" | "classifying" | "suggested" | "error";
  genreSuggestion?: {
    confidence: number;
    explanation: string;
    genre: string;
  };
  id: string;
  keyError?: string;
  keyStatus?: "idle" | "analyzing" | "detected" | "error";
  localGenreError?: string;
  localGenreStatus?:
    | "idle"
    | "analyzing"
    | "suggested"
    | "cancelled"
    | "error";
  localGenreSuggestion?: LocalGenreSuggestion;
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

function analysisSourceLabel(
  locale: Locale,
  source: ImportTrackInput["bpm_source"] | ImportTrackInput["key_source"],
  confidence: number | null,
) {
  const label =
    source === "automatic"
      ? "Análisis automático"
      : source === "metadata"
        ? "Metadatos"
        : source === "manual"
          ? "Revisado manualmente"
          : null;
  if (!label) return null;
  const localizedLabel = translate(
    locale,
    label as Parameters<typeof translate>[1],
  );
  return confidence === null
    ? localizedLabel
    : locale === "en"
      ? `${localizedLabel} · ${Math.round(confidence * 100)}% confidence`
      : `${localizedLabel} · ${Math.round(confidence * 100)}% de confianza`;
}

function chunks<T>(items: T[], size: number) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

function statusLabel(locale: Locale, status: ImportStatus) {
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
  return translate(locale, labels[status] as Parameters<typeof translate>[1]);
}

function localGenreErrorMessage(
  locale: Locale,
  error: unknown,
  fallback: FunctionalMessage,
) {
  if (!(error instanceof Error)) return translate(locale, fallback);
  const localized = translateKnown(locale, error.message);
  return locale === "en" && localized === error.message
    ? translate(locale, fallback)
    : localized;
}

export function AudioImporter() {
  const { format, locale, t } = useTranslator();
  const inputRef = useRef<HTMLInputElement>(null);
  const automaticAnalysisRunRef = useRef(0);
  const automaticAudioContextRef = useRef<AudioContext | null>(null);
  const localGenreAudioContextRef = useRef<AudioContext | null>(null);
  const localGenreClientRef = useRef<LocalGenreClient | null>(null);
  const localGenrePreparationRef = useRef<Promise<string> | null>(null);
  const [automaticAnalysisProgress, setAutomaticAnalysisProgress] =
    useState<AutomaticAnalysisProgress | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isAnalyzingKey, setIsAnalyzingKey] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAnalyzingBpm, setIsAnalyzingBpm] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localGenreBackend, setLocalGenreBackend] = useState<string | null>(null);
  const [localGenreModelError, setLocalGenreModelError] = useState<string | null>(null);
  const [localGenreModelStatus, setLocalGenreModelStatus] =
    useState<LocalGenreModelStatus>("preparing");

  const readyCount = items.filter((item) => item.status === "ready").length;
  const savedCount = items.filter((item) => item.status === "saved").length;
  const duplicateCount = items.filter(
    (item) => item.status === "duplicate",
  ).length;
  const isLocalGenreAnalyzing = items.some(
    (item) => item.localGenreStatus === "analyzing",
  );

  useEffect(() => {
    const client = new LocalGenreClient();
    localGenreClientRef.current = client;
    setLocalGenreModelStatus("preparing");
    setLocalGenreModelError(null);
    const preparation = client.prepare();
    localGenrePreparationRef.current = preparation;
    void preparation
      .then((selectedBackend) => {
        if (localGenreClientRef.current !== client) return;
        setLocalGenreBackend(selectedBackend);
        setLocalGenreModelStatus("ready");
      })
      .catch((error: unknown) => {
        if (localGenreClientRef.current !== client) return;
        setLocalGenreModelError(
          localGenreErrorMessage(
            locale,
            error,
            "No se pudo preparar el análisis local.",
          ),
        );
        setLocalGenreModelStatus("error");
      });
    return () => {
      localGenreClientRef.current = null;
      localGenrePreparationRef.current = null;
      client.dispose();
      const audioContext = localGenreAudioContextRef.current;
      localGenreAudioContextRef.current = null;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [locale]);

  useEffect(() => {
    async function synchronizeQueuedImports() {
      if (!navigator.onLine) return;
      const queued = loadOfflineMutations(window.localStorage);
      const imports = queued.filter(
        (mutation) =>
          mutation.entity === "track" && mutation.operation === "create",
      );
      if (!imports.length) return;
      try {
        const synchronizedMutationIds = new Set<string>();
        for (const group of chunks(imports, 25)) {
          const result = await saveImportedTracksAction(
            group.map((mutation) => mutation.payload as ImportTrackInput),
          );
          const completedClientIds = new Set(
            result.results
              .filter(
                (item) =>
                  item.status === "saved" || item.status === "duplicate",
              )
              .map((item) => item.client_id),
          );
          for (const mutation of group) {
            const clientId = mutation.payload.client_id;
            if (
              typeof clientId === "string" &&
              completedClientIds.has(clientId)
            ) {
              synchronizedMutationIds.add(mutation.id);
            }
          }
        }
        saveOfflineMutations(
          window.localStorage,
          queued.filter(
            (mutation) => !synchronizedMutationIds.has(mutation.id),
          ),
        );
        if (synchronizedMutationIds.size) {
          setNotice(
            locale === "en"
              ? `${synchronizedMutationIds.size} pending changes synchronized when the connection returned.`
              : `${synchronizedMutationIds.size} cambios pendientes se sincronizaron al recuperar la conexión.`,
          );
        }
      } catch {
        // The queue stays intact and is retried on the next online event.
      }
    }
    void synchronizeQueuedImports();
    window.addEventListener("online", synchronizeQueuedImports);
    return () => window.removeEventListener("online", synchronizeQueuedImports);
  }, [locale]);
  function updateItem(id: string, update: Partial<ImportItem>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  async function readFile(file: File, id: string): Promise<ImportItem> {
    if (!isAudioFile(file)) {
      const item: ImportItem = {
        error: t("El formato del archivo no parece ser de audio."),
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
        error: error ? translateKnown(locale, error) : undefined,
        file,
        genreStatus: "idle",
        id,
        keyStatus: "idle",
        localGenreStatus: "idle",
        name: file.name,
        progress: 100,
        status: error ? "invalid" : "ready",
      };
      updateItem(id, item);
      return item;
    } catch {
      const item: ImportItem = {
        error: t("No se pudieron leer las etiquetas de este archivo."),
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
      setNotice(t("Se procesaron los primeros 100 archivos seleccionados."));
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
              error: t("Este archivo coincide con otro de esta selección."),
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
                  error: t("Este archivo coincide con otro de esta selección."),
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
                  error: format("Ya existe en tu biblioteca: “{title}”.", {
                    title: duplicate.title,
                  }),
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
            t("No se pudo comprobar la biblioteca. Se volverá a comprobar al guardar."),
          );
        }
      }

      automaticTargets = completedItems.filter(
        (item) =>
          isAutomaticAnalysisEligibleStatus(item.status) &&
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
        let data = { ...item.data, [field]: value };
        if (field === "bpm") {
          data = {
            ...data,
            bpm_confidence: null,
            bpm_explanation:
              value === null ? null : t("Valor revisado manualmente."),
            bpm_source: value === null ? null : "manual",
          };
        }
        if (field === "musical_key") {
          data = {
            ...data,
            key_confidence: null,
            key_explanation:
              value === null ? null : t("Valor revisado manualmente."),
            key_source: value === null ? null : "manual",
          };
        }
        if (field === "genre") {
          data = {
            ...data,
            genre_confidence: null,
            genre_source: value === null ? null : "manual",
          };
        }
        if (field === "subgenre") {
          data = {
            ...data,
            subgenre_confidence: null,
            subgenre_source: value === null ? null : "manual",
          };
        }
        if (field === "energy") {
          data = {
            ...data,
            energy_confidence: null,
            energy_source: value === null ? null : "manual",
          };
        }
        const error = importValidationMessage(data);
        return {
          ...item,
          bpmError: field === "bpm" ? undefined : item.bpmError,
          bpmStatus: field === "bpm" ? "idle" : item.bpmStatus,
          data,
          error: error ? translateKnown(locale, error) : undefined,
          keyError: field === "musical_key" ? undefined : item.keyError,
          keyStatus:
            field === "musical_key" ? "idle" : item.keyStatus,
          localGenreStatus:
            field === "genre" || field === "subgenre"
              ? "idle"
              : item.localGenreStatus,
          localGenreSuggestion:
            field === "genre" || field === "subgenre"
              ? undefined
              : item.localGenreSuggestion,
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
    cancelLocalGenreAnalysis();
    setItems((current) =>
      current.map((item) => ({
        ...item,
        bpmStatus: item.bpmStatus === "analyzing" ? "idle" : item.bpmStatus,
        keyStatus: item.keyStatus === "analyzing" ? "idle" : item.keyStatus,
        localGenreStatus:
          item.localGenreStatus === "analyzing"
            ? "cancelled"
            : item.localGenreStatus,
      })),
    );
    setAutomaticAnalysisProgress(null);
    setIsAnalyzingBpm(false);
    setIsAnalyzingKey(false);
    setNotice(
      t("Análisis automático cancelado. Puedes reintentar cada pista o completar los datos manualmente."),
    );
  }

  async function analyzeAutomatically(targets: ImportItem[]) {
    const analyzable = targets.filter(
      (item): item is ImportItem & {
        data: ImportTrackInput;
        file: File;
      } =>
        isAutomaticAnalysisEligibleStatus(item.status) &&
        item.data !== undefined &&
        item.file !== undefined &&
        (item.data.bpm === null ||
          item.data.musical_key === null ||
          item.data.energy === null ||
          item.data.acoustic_fingerprint === null ||
          needsLocalGenreSuggestion(item.data)),
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
      t("Analizando automáticamente BPM, tonalidad, energía, género y subgénero en este dispositivo…"),
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
        const shouldAnalyzeEnergy =
          item.data.energy === null && item.data.energy_source !== "manual";
        const shouldAnalyzeLocalGenre = needsLocalGenreSuggestion(item.data);
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
          const energyResult = shouldAnalyzeEnergy
            ? analyzeEnergyFromAudioBuffer(audioBuffer)
            : null;
          const acousticSignature = createAcousticSignature(
            audioBuffer.getChannelData(0),
            audioBuffer.sampleRate,
          );
          if (automaticAnalysisRunRef.current !== runId) break;

          setItems((current) =>
            current.map((currentItem) => {
              if (currentItem.id !== item.id || !currentItem.data) {
                return currentItem;
              }

              let data: ImportTrackInput = {
                ...currentItem.data,
                acoustic_fingerprint: JSON.stringify(acousticSignature),
                ...(energyResult
                  ? {
                      energy: energyResult.energy,
                      energy_confidence: energyResult.confidence,
                      energy_source: "automatic" as const,
                    }
                  : {}),
                version_type: inferVersionType(currentItem.data.title),
              };
              let bpmError = currentItem.bpmError;
              let bpmStatus = currentItem.bpmStatus;
              let keyError = currentItem.keyError;
              let keyStatus = currentItem.keyStatus;

              if (shouldAnalyzeBpm) {
                if (bpmResult.status === "fulfilled" && bpmResult.value) {
                  data = {
                    ...data,
                    bpm: bpmResult.value.bpm,
                    bpm_confidence: bpmResult.value.confidence,
                    bpm_explanation: bpmResult.value.explanation,
                    bpm_source: "automatic",
                  };
                  bpmError = undefined;
                  bpmStatus = "detected";
                } else {
                  bpmError = t(
                    "No se pudo estimar el BPM. Puedes reintentarlo o escribirlo manualmente.",
                  );
                  bpmStatus = "error";
                }
              }

              if (shouldAnalyzeKey) {
                if (keyResult.status === "fulfilled" && keyResult.value) {
                  data = {
                    ...data,
                    key_confidence: keyResult.value.confidence,
                    key_explanation: keyResult.value.explanation,
                    key_source: "automatic",
                    musical_key: keyResult.value.musicalKey,
                  };
                  keyError = undefined;
                  keyStatus = "detected";
                } else {
                  keyError = t(
                    "No se pudo estimar la tonalidad. Puedes reintentarlo o escribirla manualmente.",
                  );
                  keyStatus = "error";
                }
              }

              const error = importValidationMessage(data);
              return {
                ...currentItem,
                bpmError,
                bpmStatus,
                data,
                error: error ? translateKnown(locale, error) : undefined,
                keyError,
                keyStatus,
                status: error ? "invalid" : "ready",
              };
            }),
          );

          if (
            shouldAnalyzeLocalGenre &&
            automaticAnalysisRunRef.current === runId
          ) {
            await suggestGenreLocally(item, runId);
          }
        } catch {
          updateItem(item.id, {
            bpmError: shouldAnalyzeBpm
              ? t("No se pudo decodificar el audio para estimar el BPM.")
              : item.bpmError,
            bpmStatus: shouldAnalyzeBpm ? "error" : item.bpmStatus,
            keyError: shouldAnalyzeKey
              ? t("No se pudo decodificar el audio para estimar la tonalidad.")
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
          t("Análisis automático terminado. Revisa las estimaciones antes de guardar."),
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
                      ? t("El navegador no pudo iniciar el análisis automático.")
                      : item.bpmError,
                  keyStatus:
                    item.keyStatus === "analyzing" ? "error" : item.keyStatus,
                  keyError:
                    item.keyStatus === "analyzing"
                      ? t("El navegador no pudo iniciar el análisis automático.")
                      : item.keyError,
                }
              : item,
          ),
        );
        setNotice(
          t("No se pudo iniciar el analizador automático en este navegador."),
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

              const data = {
                ...currentItem.data,
                bpm: bpm.bpm,
                bpm_confidence: bpm.confidence,
                bpm_explanation: bpm.explanation,
                bpm_source: "automatic" as const,
              };
              const error = importValidationMessage(data);
              return {
                ...currentItem,
                bpmError: undefined,
                bpmStatus: "detected",
                data,
                error: error ? translateKnown(locale, error) : undefined,
                status: error ? "invalid" : "ready",
              };
            }),
          );
        } catch {
          updateItem(item.id, {
            bpmError: t("No se pudo estimar el BPM. Puedes escribirlo manualmente."),
            bpmStatus: "error",
          });
        }
      }

      setNotice(
        t("Análisis de BPM terminado. Revisa las estimaciones antes de guardar."),
      );
    } catch {
      const targetIds = new Set(analyzable.map((item) => item.id));
      setItems((current) =>
        current.map((item) =>
          targetIds.has(item.id) && item.bpmStatus === "analyzing"
            ? {
                ...item,
                bpmError: t(
                  "El navegador no pudo iniciar el análisis. Escribe el BPM manualmente.",
                ),
                bpmStatus: "error",
              }
            : item,
        ),
      );
      setNotice(t("No se pudo iniciar el analizador de audio en este navegador."));
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
                key_confidence: result.confidence,
                key_explanation: result.explanation,
                key_source: "automatic" as const,
                musical_key: result.musicalKey,
              };
              const error = importValidationMessage(data);
              return {
                ...currentItem,
                data,
                error: error ? translateKnown(locale, error) : undefined,
                keyError: undefined,
                keyStatus: "detected",
                status: error ? "invalid" : "ready",
              };
            }),
          );
        } catch {
          updateItem(item.id, {
            keyError: t(
              "No se pudo estimar la tonalidad. Puedes escribirla manualmente.",
            ),
            keyStatus: "error",
          });
        }
      }

      setNotice(
        t("Análisis tonal terminado. Revisa las estimaciones antes de guardar."),
      );
    } catch {
      const targetIds = new Set(analyzable.map((item) => item.id));
      setItems((current) =>
        current.map((item) =>
          targetIds.has(item.id) && item.keyStatus === "analyzing"
            ? {
                ...item,
                keyError: t(
                  "El navegador no pudo iniciar el análisis. Escribe la tonalidad manualmente.",
                ),
                keyStatus: "error",
              }
            : item,
        ),
      );
      setNotice(t("No se pudo iniciar el analizador tonal en este navegador."));
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
    const acousticCandidates = ready.flatMap((item) =>
        item.data.acoustic_fingerprint
          ? [
              {
                acousticFingerprint: item.data.acoustic_fingerprint,
                bpm: item.data.bpm,
                clientId: item.id,
                durationSeconds: item.data.duration_seconds,
                title: item.data.title,
              },
            ]
          : [],
    );
    let matchResult: Awaited<ReturnType<typeof checkAcousticMatchesAction>> = {
      matches: [],
    };
    try {
      if (acousticCandidates.length) {
        matchResult = await checkAcousticMatchesAction(acousticCandidates);
      }
    } catch {
      matchResult = {
        matches: [],
        message: t(
          "No se pudo completar la comparación acústica; la importación continúa con la comprobación de huellas exactas.",
        ),
      };
    }
    const matchById = new Map(
      matchResult.matches.map((match) => [match.clientId, match]),
    );
    const exactDuplicateIds = new Set(
      matchResult.matches
        .filter((match) => match.relationship === "duplicate")
        .map((match) => match.clientId),
    );
    if (matchResult.matches.length) {
      setItems((current) =>
        current.map((item) => {
          const match = matchById.get(item.id);
          if (!match) return item;
          return {
            ...item,
            acousticMatch: match,
            duplicateTrackId:
              match.relationship === "duplicate"
                ? match.trackId
                : item.duplicateTrackId,
            error:
              match.relationship === "duplicate"
                ? locale === "en"
                  ? `Acoustic match with “${match.trackTitle}”.`
                  : `Coincidencia acústica con “${match.trackTitle}”.`
                : item.error,
            status:
              match.relationship === "duplicate" ? "duplicate" : item.status,
          };
        }),
      );
    }
    if (exactDuplicateIds.size) {
      setNotice(
        locale === "en"
          ? `${exactDuplicateIds.size} tracks acoustically match the library and were not saved. Review possible versions or remixes before continuing.`
          : `${exactDuplicateIds.size} pistas coinciden acústicamente con la biblioteca y no se guardaron. Revisa las posibles versiones o remixes antes de continuar.`,
      );
      setIsSaving(false);
      return;
    }
    if (matchResult.message) setNotice(matchResult.message);

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
            const responseMessage = translateKnown(locale, response.message);
            const groupIds = new Set(group.map((item) => item.id));
            setItems((current) =>
              current.map((item) =>
                groupIds.has(item.id)
                  ? {
                      ...item,
                      error: responseMessage,
                      status: "error",
                    }
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
                error: result.message
                  ? translateKnown(locale, result.message)
                  : undefined,
                status: result.status,
              };
            }),
          );
        } catch {
          const groupIds = new Set(group.map((item) => item.id));
          const queued = loadOfflineMutations(window.localStorage);
          const pending: OfflineMutation[] = group.map((item) => ({
            createdAt: new Date().toISOString(),
            entity: "track",
            entityId: item.id,
            id: crypto.randomUUID(),
            operation: "create",
            payload: item.data,
            revision: null,
          }));
          saveOfflineMutations(window.localStorage, [...queued, ...pending]);
          setItems((current) =>
            current.map((item) =>
              groupIds.has(item.id)
                ? {
                    ...item,
                    error: t(
                      "Se perdió la conexión. Los metadatos quedaron en la cola offline.",
                    ),
                    status: "error",
                  }
                : item,
            ),
          );
        }
      }

      setNotice(
        t("Importación terminada. Los errores pueden corregirse y reintentarse."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function classifyGenre(item: ImportItem) {
    if (
      !item.file ||
      !item.data ||
      !isAutomaticAnalysisEligibleStatus(item.status)
    ) {
      return;
    }
    updateItem(item.id, {
      genreError: undefined,
      genreStatus: "classifying",
      genreSuggestion: undefined,
    });
    let audioContext: AudioContext | null = null;
    try {
      audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(
        await item.file.arrayBuffer(),
      );
      const clip = createWavClipFromAudioBuffer(decoded);
      const body = new FormData();
      body.set("consent", "true");
      body.set("audio", clip, `${item.file.name}.clip.wav`);
      const result = await fetch("/api/audio/genre", {
        body,
        method: "POST",
      });
      const payload = (await result.json()) as {
        error?: string;
        suggestion?: ImportItem["genreSuggestion"];
      };
      if (!result.ok || !payload.suggestion) {
        throw new Error(
          payload.error
            ? translateKnown(locale, payload.error)
            : t("No se recibió una sugerencia."),
        );
      }
      updateItem(item.id, {
        genreStatus: "suggested",
        genreSuggestion: payload.suggestion,
      });
    } catch (error) {
      updateItem(item.id, {
        genreError:
          error instanceof Error
            ? error.message
            : t("No se pudo clasificar el género."),
        genreStatus: "error",
      });
    } finally {
      if (audioContext) {
        await audioContext.close().catch(() => undefined);
      }
    }
  }

  async function suggestGenreLocally(item: ImportItem, automaticRunId?: number) {
    const client = localGenreClientRef.current;
    if (
      !client ||
      !item.file ||
      !item.data ||
      !isAutomaticAnalysisEligibleStatus(item.status) ||
      (automaticRunId === undefined && localGenreModelStatus !== "ready")
    ) {
      return;
    }
    updateItem(item.id, {
      localGenreError: undefined,
      localGenreStatus: "analyzing",
      localGenreSuggestion: undefined,
    });
    let audioContext: AudioContext | null = null;
    try {
      await localGenrePreparationRef.current;
      if (
        automaticRunId !== undefined &&
        automaticAnalysisRunRef.current !== automaticRunId
      ) {
        return;
      }
      audioContext = new AudioContext({ sampleRate: 16_000 });
      localGenreAudioContextRef.current = audioContext;
      const decoded = await audioContext.decodeAudioData(
        await item.file.arrayBuffer(),
      );
      if (
        automaticRunId !== undefined &&
        automaticAnalysisRunRef.current !== automaticRunId
      ) {
        return;
      }
      if (decoded.sampleRate !== 16_000) {
        throw new Error(t("El navegador no pudo remuestrear el audio a 16 kHz."));
      }
      const mono = new Float32Array(decoded.length);
      for (let channelIndex = 0; channelIndex < decoded.numberOfChannels; channelIndex += 1) {
        const channel = decoded.getChannelData(channelIndex);
        for (let sampleIndex = 0; sampleIndex < mono.length; sampleIndex += 1) {
          mono[sampleIndex] += channel[sampleIndex] / decoded.numberOfChannels;
        }
      }
      const suggestion = await client.analyze(mono);
      if (
        automaticRunId !== undefined &&
        automaticAnalysisRunRef.current !== automaticRunId
      ) {
        return;
      }
      updateItem(item.id, {
        localGenreStatus: "suggested",
        localGenreSuggestion: suggestion,
      });
    } catch (error) {
      if (error instanceof LocalGenreCancelledError) return;
      updateItem(item.id, {
        localGenreError: localGenreErrorMessage(
          locale,
          error,
          "No se pudo sugerir un género localmente.",
        ),
        localGenreStatus: "error",
      });
    } finally {
      if (localGenreAudioContextRef.current === audioContext) {
        localGenreAudioContextRef.current = null;
      }
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close().catch(() => undefined);
      }
    }
  }

  function cancelLocalGenreAnalysis() {
    const audioContext = localGenreAudioContextRef.current;
    localGenreAudioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    const client = localGenreClientRef.current;
    client?.cancel();
    if (!client) return;
    setLocalGenreModelStatus("preparing");
    setLocalGenreBackend(null);
    const preparation = client.prepare();
    localGenrePreparationRef.current = preparation;
    void preparation
      .then((selectedBackend) => {
        if (localGenreClientRef.current !== client) return;
        setLocalGenreBackend(selectedBackend);
        setLocalGenreModelStatus("ready");
      })
      .catch((error: unknown) => {
        if (localGenreClientRef.current !== client) return;
        setLocalGenreModelError(
          localGenreErrorMessage(
            locale,
            error,
            "No se pudo preparar el análisis local.",
          ),
        );
        setLocalGenreModelStatus("error");
      });
  }

  function cancelLocalGenre(item: ImportItem) {
    cancelLocalGenreAnalysis();
    updateItem(item.id, {
      localGenreError: undefined,
      localGenreStatus: "cancelled",
      localGenreSuggestion: undefined,
    });
  }

  function acceptLocalGenreSuggestion(item: ImportItem) {
    const suggestion = item.localGenreSuggestion;
    if (!suggestion) return;
    setItems((current) =>
      current.map((currentItem) => {
        if (currentItem.id !== item.id || !currentItem.data) return currentItem;
        return {
          ...currentItem,
          data: applyLocalGenreSuggestion(
            currentItem.data,
            suggestion,
          ),
          localGenreStatus: "idle",
          localGenreSuggestion: undefined,
        };
      }),
    );
  }

  function rejectLocalGenreSuggestion(item: ImportItem) {
    updateItem(item.id, {
      localGenreStatus: "idle",
      localGenreSuggestion: undefined,
    });
  }

  function acceptGenreSuggestion(item: ImportItem) {
    if (!item.genreSuggestion) return;
    setItems((current) =>
      current.map((currentItem) => {
        if (currentItem.id !== item.id || !currentItem.data) return currentItem;
        const data: ImportTrackInput = {
          ...currentItem.data,
          genre: item.genreSuggestion?.genre ?? null,
          genre_confidence: item.genreSuggestion?.confidence ?? null,
          genre_source: "automatic",
        };
        return {
          ...currentItem,
          data,
          genreStatus: "idle",
          genreSuggestion: undefined,
        };
      }),
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section
      className="import-flow"
      aria-busy={
        isReading ||
        isSaving ||
        isAnalyzingBpm ||
        isAnalyzingKey ||
        isLocalGenreAnalyzing
      }
    >
      <div className="card import-dropzone">
        <div>
          <p className="eyebrow">{t("Importación privada")}</p>
          <h2>{t("El audio no sale de este dispositivo")}</h2>
          <p>
            {t("DJOrganizer calcula una huella digital del archivo para detectar copias exactas y estima BPM, tonalidad, energía, género y subgénero al seleccionarlo. El análisis ocurre en el navegador. Solo guarda los datos que revises; no sube audio ni portadas.")}
          </p>
        </div>
        <input
          ref={inputRef}
          accept="audio/*,.aac,.aif,.aiff,.ape,.flac,.m4a,.mp3,.mp4,.ogg,.opus,.wav,.webm,.wma"
          className="visually-hidden"
          disabled={
            isReading ||
            isSaving ||
            isAnalyzingBpm ||
            isAnalyzingKey ||
            automaticAnalysisProgress !== null
          }
          id="audio-files"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          type="file"
        />
        <label className="button button--primary" htmlFor="audio-files">
          {isReading ? t("Leyendo archivos…") : t("Seleccionar archivos")}
        </label>
      </div>

      <p
        className={`local-genre-model-status local-genre-model-status--${localGenreModelStatus}`}
        role="status"
        aria-live="polite"
      >
        {localGenreModelStatus === "preparing"
          ? t("Preparando análisis local…")
          : localGenreModelStatus === "ready"
            ? `${t("Análisis local preparado")} · ${localGenreBackend?.toUpperCase() ?? ""}`
            : `${t("Análisis local no disponible.")} ${localGenreModelError ?? ""}`}
      </p>

      {notice ? (
        <p className="form-message form-message--success" role="status">
          {notice}
        </p>
      ) : null}

      {items.length ? (
        <>
          <div className="import-toolbar">
            <p>
              <strong>{items.length}</strong> {t("archivos")} · {readyCount}{" "}
              {t("listos")} · {savedCount} {t("guardados")} · {duplicateCount}{" "}
              {t("duplicados")}
            </p>
            <div className="import-actions">
              {automaticAnalysisProgress ? (
                <div
                  className="import-analysis-progress"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    {t("Analizando")} {automaticAnalysisProgress.completed}{" "}
                    {t("de")}{" "}
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
                    {t("Cancelar análisis")}
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
                {isSaving
                  ? t("Guardando…")
                  : format("Guardar {count} pistas", { count: readyCount })}
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
                      {statusLabel(locale, item.status)}
                    </span>
                  </div>
                  <button
                    aria-label={format("Quitar {name}", { name: item.name })}
                    className="import-remove"
                    disabled={item.status === "saving"}
                    onClick={() => removeItem(item.id)}
                    type="button"
                  >
                    {t("Quitar")}
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
                      {t("Título")}
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
                      {t("Subgénero")}
                      <input
                        disabled={isLocked}
                        maxLength={120}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "subgenre",
                            event.target.value || null,
                          )
                        }
                        value={item.data.subgenre ?? ""}
                      />
                    </label>
                    <label className="field">
                      {t("Artista (opcional)")}
                      <input
                        disabled={isLocked}
                        maxLength={300}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "artist",
                            event.target.value || null,
                          )
                        }
                        value={item.data.artist ?? ""}
                      />
                    </label>
                    <label className="field">
                      {t("Álbum")}
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
                    <div className="field">
                      <label htmlFor={`import-genre-${item.id}`}>
                        {t("Género")}
                      </label>
                      <input
                        disabled={isLocked}
                        id={`import-genre-${item.id}`}
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
                      {item.file &&
                      isAutomaticAnalysisEligibleStatus(item.status) &&
                      (item.localGenreStatus === "error" ||
                        item.localGenreStatus === "cancelled") ? (
                        <button
                          className="import-analyze-link"
                          disabled={
                            localGenreModelStatus !== "ready" ||
                            isLocalGenreAnalyzing ||
                            isSaving
                          }
                          onClick={() => void suggestGenreLocally(item)}
                          type="button"
                        >
                          {localGenreModelStatus === "preparing"
                            ? t("Preparando análisis local…")
                            : t("Reintentar análisis de género y subgénero")}
                        </button>
                      ) : null}
                      {item.localGenreStatus === "analyzing" ? (
                        <button
                          className="import-analyze-link"
                          onClick={() =>
                            automaticAnalysisProgress
                              ? cancelAutomaticAnalysis()
                              : cancelLocalGenre(item)
                          }
                          type="button"
                        >
                          {t("Cancelar")}
                        </button>
                      ) : null}
                      {item.localGenreStatus === "cancelled" ? (
                        <small role="status">{t("Análisis local cancelado.")}</small>
                      ) : null}
                      {item.localGenreSuggestion ? (
                        <span className="genre-suggestion genre-suggestion--local" role="status">
                          <small className="local-analysis-badge">
                            {t("Análisis local")}
                          </small>
                          <strong>
                            {t("Género")}: {item.localGenreSuggestion.genre} ·{" "}
                            {t("Subgénero")}: {item.localGenreSuggestion.subgenre} ·{" "}
                            {Math.round(item.localGenreSuggestion.score * 100)}%
                          </strong>
                          {item.localGenreSuggestion.alternatives.length ? (
                            <small>
                              {t("Alternativas")}: {item.localGenreSuggestion.alternatives
                                .map(
                                  (alternative) =>
                                    `${alternative.genre} / ${alternative.subgenre} (${Math.round(alternative.score * 100)}%)`,
                                )
                                .join(", ")}
                            </small>
                          ) : null}
                          <small>{t("Puntuación orientativa; revisa antes de aceptar.")}</small>
                          <span className="genre-suggestion__actions">
                            <button
                              className="import-analyze-link"
                              onClick={() => acceptLocalGenreSuggestion(item)}
                              type="button"
                            >
                              {t("Aceptar sugerencia")}
                            </button>
                            <button
                              className="import-analyze-link"
                              onClick={() => rejectLocalGenreSuggestion(item)}
                              type="button"
                            >
                              {t("Rechazar")}
                            </button>
                          </span>
                        </span>
                      ) : null}
                      {item.localGenreError ? (
                        <small className="field-error" role="alert">
                          {item.localGenreError}
                        </small>
                      ) : null}
                      {item.file &&
                      isAutomaticAnalysisEligibleStatus(item.status) ? (
                        <button
                          className="import-analyze-link"
                          disabled={
                            item.genreStatus === "classifying" ||
                            isSaving
                          }
                          onClick={() => void classifyGenre(item)}
                          type="button"
                        >
                          {item.genreStatus === "classifying"
                            ? t("Clasificando…")
                            : t("Sugerir género con OpenAI")}
                        </button>
                      ) : null}
                      {item.file &&
                      isAutomaticAnalysisEligibleStatus(item.status) ? (
                        <small className="analysis-evidence">
                          {t("Al pulsar se enviará un fragmento mono de hasta 45 segundos. La sugerencia solo se aplica tras revisarla.")}
                        </small>
                      ) : null}
                      {item.genreSuggestion ? (
                        <span className="genre-suggestion" role="status">
                          <strong>
                            {item.genreSuggestion.genre} ·{" "}
                            {Math.round(item.genreSuggestion.confidence * 100)}%
                          </strong>
                          <small>{item.genreSuggestion.explanation}</small>
                          <button
                            className="import-analyze-link"
                            onClick={() => acceptGenreSuggestion(item)}
                            type="button"
                          >
                            {t("Aplicar sugerencia")}
                          </button>
                        </span>
                      ) : null}
                      {item.genreError ? (
                        <small className="field-error" role="alert">
                          {item.genreError}
                        </small>
                      ) : null}
                    </div>
                    <label className="field">
                      {t("Energía")}
                      <input
                        disabled={isLocked}
                        max={10}
                        min={0}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "energy",
                            event.target.value
                              ? Number(event.target.value)
                              : null,
                          )
                        }
                        type="number"
                        value={item.data.energy ?? ""}
                      />
                      <small>{t("0–10, calculada automáticamente y editable")}</small>
                    </label>
                    <label className="field">
                      {t("Versión")}
                      <select
                        disabled={isLocked}
                        onChange={(event) =>
                          updateField(
                            item.id,
                            "version_type",
                            event.target.value || null,
                          )
                        }
                        value={item.data.version_type ?? "unknown"}
                      >
                        <option value="original">{t("Original")}</option>
                        <option value="remix">{t("Remix / mix / dub")}</option>
                        <option value="edit">{t("Edit / radio / extended")}</option>
                        <option value="live">{t("Live")}</option>
                        <option value="remaster">{t("Remaster")}</option>
                        <option value="unknown">{t("Sin identificar")}</option>
                      </select>
                    </label>
                    <label className="field import-bpm-field">
                      <span>
                        BPM
                        {analysisSourceLabel(
                          locale,
                          item.data.bpm_source,
                          item.data.bpm_confidence,
                        ) ? (
                          <small>
                            {analysisSourceLabel(
                              locale,
                              item.data.bpm_source,
                              item.data.bpm_confidence,
                            )}
                          </small>
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
                      {item.data.bpm_explanation ? (
                        <small className="analysis-evidence">
                          {translateKnown(locale, item.data.bpm_explanation)}
                        </small>
                      ) : null}
                      {item.file &&
                      isAutomaticAnalysisEligibleStatus(item.status) &&
                      item.bpmStatus !== "analyzing" ? (
                        <button
                          className="import-analyze-link"
                          disabled={isAnalyzingBpm || isSaving || isReading}
                          onClick={() => void analyzeBpm([item])}
                          type="button"
                        >
                          {item.data.bpm === null
                            ? t("Reintentar detección")
                            : t("Volver a analizar")}
                        </button>
                      ) : null}
                      {item.bpmStatus === "analyzing" ? (
                        <small role="status">{t("Analizando el audio local…")}</small>
                      ) : null}
                      {item.bpmError ? (
                        <small className="field-error" role="alert">
                          {item.bpmError}
                        </small>
                      ) : null}
                    </label>
                    <label className="field import-key-field">
                      <span>
                        {t("Tonalidad")}
                        {analysisSourceLabel(
                          locale,
                          item.data.key_source,
                          item.data.key_confidence,
                        ) ? (
                          <small>
                            {analysisSourceLabel(
                              locale,
                              item.data.key_source,
                              item.data.key_confidence,
                            )}
                          </small>
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
                      {item.data.key_explanation ? (
                        <small className="analysis-evidence">
                          {translateKnown(locale, item.data.key_explanation)}
                        </small>
                      ) : null}
                      {item.file &&
                      isAutomaticAnalysisEligibleStatus(item.status) &&
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
                            ? t("Reintentar detección")
                            : t("Volver a analizar")}
                        </button>
                      ) : null}
                      {item.keyStatus === "analyzing" ? (
                        <small role="status">{t("Analizando armonía local…")}</small>
                      ) : null}
                      {item.keyError ? (
                        <small className="field-error" role="alert">
                          {item.keyError}
                        </small>
                      ) : null}
                    </label>
                    <label className="field">
                      {t("Año")}
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
                      {t("Duración (segundos)")}
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
                        {t("Ver la pista")}
                      </Link>
                    ) : null}
                  </p>
                ) : null}
                {item.acousticMatch &&
                item.acousticMatch.relationship !== "duplicate" ? (
                  <p className="form-message" role="status">
                    {locale === "en" ? "Possible" : "Posible"}{" "}
                    {item.acousticMatch.relationship === "same-release"
                      ? t("versión de la misma edición")
                      : t("versión o remix")}{" "}
                    {locale === "en" ? "of" : "de"} “
                    {item.acousticMatch.trackTitle}” (
                    {Math.round(item.acousticMatch.similarity * 100)}%{" "}
                    {locale === "en"
                      ? "similarity). Review the version type before saving."
                      : "de similitud). Revisa el tipo de versión antes de guardar."}{" "}
                    <Link href={`/library/${item.acousticMatch.trackId}`}>
                      {t("Comparar")}
                    </Link>
                  </p>
                ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card import-empty">
          <p>{t("Selecciona hasta 100 archivos para preparar una importación.")}</p>
          <small>
            {t("Formatos habituales: MP3, M4A, FLAC, WAV, AIFF, AAC, OGG y Opus.")}
          </small>
        </div>
      )}
    </section>
  );
}
