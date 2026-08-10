import type { DesktopMaestResult } from "@/lib/desktop/maest-analysis";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
  isDesktopMaestCompatibilityKey,
  type DesktopMaestCompatibilityKey,
} from "@/lib/desktop/maest-analysis";
import type { TauriCore } from "@/lib/desktop/tauri";
import type { Tables } from "@/types/database";

export type MaestPublicResult = {
  scanId: string;
  analysis: DesktopMaestResult;
};

export type MaestRequestIdentity = {
  requestId: number;
  trackId: string;
  sessionId: string;
  scanId: string;
  operationId: string;
};

export type MaestLinkIdentity = Omit<MaestRequestIdentity, "requestId" | "operationId">;
export type MaestPreviewPhase = "idle" | "preparing" | "analyzing" | "cancelling";
export type MaestSurfaceVisibility = "hidden" | "unlinked" | "linked";
export type MaestPreviewState = {
  identity: MaestLinkIdentity | null;
  phase: MaestPreviewPhase;
  proposal: MaestPublicResult | null;
  error: string | null;
  activeRequest: MaestRequestIdentity | null;
};

export type MaestFormFields = {
  genre: string;
  subgenre: string;
  evidence: MaestFormEvidence;
};

export type MaestFieldEvidence = {
  value: string;
  analyzerId: typeof DESKTOP_MAEST_ANALYZER.id;
  analyzerVersion: typeof DESKTOP_MAEST_ANALYZER.version;
  compatibilityKey: DesktopMaestCompatibilityKey;
  analyzedAt: string;
  rawScore: number;
};

export type MaestFormEvidence = {
  genre?: MaestFieldEvidence;
  subgenre?: MaestFieldEvidence;
};

export type MaestFormProposal = {
  genre: MaestFieldEvidence | null;
  subgenre: MaestFieldEvidence | null;
};

export function initialTrackClassification(
  mode: "create" | "update",
  genre?: string | null,
  subgenre?: string | null,
): MaestFormFields {
  return mode === "create"
    ? { genre: "", subgenre: "", evidence: {} }
    : {
        genre: genre ?? "",
        subgenre: subgenre ?? "",
        evidence: {},
      };
}

export type MaestPreviewAction =
  | { type: "linkChanged"; identity: MaestLinkIdentity | null }
  | { type: "start"; requestId: number }
  | { type: "prepared"; request: MaestRequestIdentity }
  | { type: "cancelRequested"; request: MaestRequestIdentity }
  | { type: "cancelled"; request: MaestRequestIdentity }
  | { type: "succeeded"; request: MaestRequestIdentity; result: MaestPublicResult }
  | { type: "failed"; request: MaestRequestIdentity; error: string }
  | { type: "discard" }
  | { type: "invalidate" };

export function sameMaestLink(
  left: MaestLinkIdentity | null,
  right: MaestLinkIdentity | null,
) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.trackId === right.trackId &&
      left.sessionId === right.sessionId &&
      left.scanId === right.scanId)
  );
}

export function createMaestPreviewState(
  identity: MaestLinkIdentity | null,
): MaestPreviewState {
  return {
    identity,
    phase: "idle",
    proposal: null,
    error: null,
    activeRequest: null,
  };
}

export function maestSurfaceVisibility(
  desktopAvailable: boolean,
  identity: MaestLinkIdentity | null,
): MaestSurfaceVisibility {
  if (!desktopAvailable) return "hidden";
  return identity ? "linked" : "unlinked";
}

function nonEmptyProposal(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function fieldEvidence(
  result: MaestPublicResult,
  field: "genre" | "subgenre",
): MaestFieldEvidence | null {
  const analysis = result.analysis;
  const candidate = analysis[field];
  const value = nonEmptyProposal(candidate.proposedValue);
  if (
    analysis.analyzer.id !== DESKTOP_MAEST_ANALYZER.id ||
    analysis.analyzer.version !== DESKTOP_MAEST_ANALYZER.version ||
    analysis.compatibilityKey !== DESKTOP_MAEST_COMPATIBILITY_KEY ||
    candidate.status !== "completed" ||
    !value ||
    typeof candidate.score !== "number" ||
    !Number.isFinite(candidate.score) ||
    typeof candidate.analyzedAt !== "string" ||
    !/^(?:0|[1-9]\d*)$/.test(candidate.analyzedAt) ||
    !Number.isSafeInteger(Number(candidate.analyzedAt))
  ) return null;
  return {
    value,
    analyzerId: DESKTOP_MAEST_ANALYZER.id,
    analyzerVersion: DESKTOP_MAEST_ANALYZER.version,
    compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
    analyzedAt: candidate.analyzedAt,
    rawScore: candidate.score,
  };
}

export function maestFormProposal(
  result: MaestPublicResult | null,
): MaestFormProposal | null {
  if (!result) return null;
  const proposal = {
    genre: fieldEvidence(result, "genre"),
    subgenre: fieldEvidence(result, "subgenre"),
  };
  return proposal.genre || proposal.subgenre ? proposal : null;
}

export function applyMaestFormProposal(
  current: MaestFormFields,
  proposal: MaestFormProposal,
): MaestFormFields {
  return {
    genre: proposal.genre?.value ?? current.genre,
    subgenre: proposal.subgenre?.value ?? current.subgenre,
    evidence: {
      ...current.evidence,
      ...(proposal.genre ? { genre: proposal.genre } : {}),
      ...(proposal.subgenre ? { subgenre: proposal.subgenre } : {}),
    },
  };
}

export function editMaestFormField(
  current: MaestFormFields,
  field: "genre" | "subgenre",
  value: string,
): MaestFormFields {
  const evidence = { ...current.evidence };
  delete evidence[field];
  return { ...current, [field]: value, evidence };
}

function requestMatchesState(
  state: MaestPreviewState,
  request: MaestRequestIdentity,
) {
  return (
    state.activeRequest !== null &&
    isCurrentMaestRequest(request, state.activeRequest) &&
    sameMaestLink(state.identity, request)
  );
}

export function reduceMaestPreviewState(
  state: MaestPreviewState,
  action: MaestPreviewAction,
): MaestPreviewState {
  switch (action.type) {
    case "linkChanged":
      return sameMaestLink(state.identity, action.identity)
        ? state
        : createMaestPreviewState(action.identity);
    case "start":
      if (!state.identity || state.phase !== "idle") return state;
      return {
        ...state,
        phase: "preparing",
        error: null,
        activeRequest: { ...state.identity, requestId: action.requestId, operationId: crypto.randomUUID() },
      };
    case "prepared":
      return requestMatchesState(state, action.request)
        ? { ...state, phase: "analyzing" }
        : state;
    case "cancelRequested":
      return requestMatchesState(state, action.request) && state.phase === "analyzing"
        ? { ...state, phase: "cancelling", error: null }
        : state;
    case "cancelled":
      return requestMatchesState(state, action.request)
        ? { ...state, phase: "idle", error: null, activeRequest: null }
        : state;
    case "succeeded":
      return requestMatchesState(state, action.request) &&
        action.result.scanId === action.request.scanId
        ? {
            ...state,
            phase: "idle",
            proposal: action.result,
            error: null,
            activeRequest: null,
          }
        : state;
    case "failed":
      return requestMatchesState(state, action.request)
        ? {
            ...state,
            phase: "idle",
            proposal: null,
            error: action.error,
            activeRequest: null,
          }
        : state;
    case "discard":
      return state.proposal ? { ...state, proposal: null } : state;
    case "invalidate":
      return createMaestPreviewState(state.identity);
  }
}

export function maestAnalyzeArguments(sessionId: string, scanId: string, operationId: string) {
  return { request: { sessionId, scanId, operationId } } as const;
}

export function maestCancelArguments(sessionId: string, scanId: string, operationId: string) {
  return { request: { sessionId, scanId, operationId } } as const;
}

export function invokeMaestCancel(core: TauriCore, request: MaestRequestIdentity) {
  return core.invoke("cancel_maest_analysis", maestCancelArguments(request.sessionId, request.scanId, request.operationId));
}

export async function invokeMaestPreview(
  core: TauriCore,
  sessionId: string,
  scanId: string,
  operationId: string,
  onPrepared: () => boolean,
) {
  await core.invoke("prepare_maest_model");
  if (!onPrepared()) return null;
  return core.invoke<MaestPublicResult>(
    "analyze_scanned_track",
    maestAnalyzeArguments(sessionId, scanId, operationId),
  );
}

export function isCurrentMaestRequest(
  request: MaestRequestIdentity,
  current: MaestRequestIdentity,
) {
  return (
    request.requestId === current.requestId &&
    request.trackId === current.trackId &&
    request.sessionId === current.sessionId &&
    request.scanId === current.scanId
    && request.operationId === current.operationId
  );
}

export function isMaestCancellation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as CommandError).code === "analysis_cancelled");
}

type CommandError = { code?: unknown; stage?: unknown };

export function maestErrorMessage(error: unknown, locale: "es" | "en") {
  const safe = error && typeof error === "object" ? (error as CommandError) : {};
  const code = typeof safe.code === "string" ? safe.code : "";
  const stage = typeof safe.stage === "string" ? safe.stage : "";
  const en = locale === "en";

  if (code === "analyzer_busy") return en ? "The analyzer is busy. Try again shortly." : "El analizador está ocupado. Reinténtalo en unos instantes.";
  if (code === "model_not_ready") return en ? "The analyzer could not be prepared. Try again." : "No se pudo preparar el analizador. Reinténtalo.";
  if (code === "track_changed") return en ? "The local file changed. Scan and link it again." : "El archivo local ha cambiado. Vuelve a escanearlo y vincularlo.";
  if (code === "track_unavailable" || code === "track_not_in_session") return en ? "This track is no longer available in the active scan. Scan and link it again." : "La pista ya no está disponible en el escaneo activo. Vuelve a escanearla y vincularla.";
  if (code === "scan_session_unavailable") return en ? "The local scan is no longer active. Scan and link the track again." : "El escaneo local ya no está activo. Vuelve a escanear y vincular la pista.";
  if (code === "analysis_task_failed") return en ? "The local analysis stopped unexpectedly. Try again." : "El análisis local se interrumpió. Reinténtalo.";
  if (["decode", "resample", "preprocess", "inference", "taxonomy"].includes(stage)) {
    const stageCopy = {
      decode: en ? "The audio could not be read." : "No se pudo leer el audio.",
      resample: en ? "The audio could not be prepared." : "No se pudo preparar el audio.",
      preprocess: en ? "The audio could not be prepared for analysis." : "No se pudo preparar el audio para analizarlo.",
      inference: en ? "The analyzer could not process this track." : "El analizador no pudo procesar esta pista.",
      taxonomy: en ? "The result could not be classified." : "No se pudo clasificar el resultado.",
    } as const;
    return stageCopy[stage as keyof typeof stageCopy];
  }
  return en ? "The local analysis could not be completed. Try again." : "No se pudo completar el análisis local. Reinténtalo.";
}

export type MaestGenreWriteAvailability = "available" | "needs-save" | "unavailable";

export type MaestGenreWritePreview = {
  scanId: string;
  field: "genre";
  before: string | null;
  after: string;
  changed: boolean;
};

export type MaestGenreWriteResult = {
  appliedFiles: number;
  runId: string | null;
};

export function maestGenreWriteAvailability(
  track: Tables<"tracks">,
  formGenre: string,
  linked: boolean,
): MaestGenreWriteAvailability {
  const persisted = track.genre?.trim();
  const validEvidence =
    persisted &&
    track.genre_source === "automatic" &&
    track.genre_analyzer_id === DESKTOP_MAEST_ANALYZER.id &&
    track.genre_analyzer_version === DESKTOP_MAEST_ANALYZER.version &&
    isDesktopMaestCompatibilityKey(track.genre_compatibility_key) &&
    typeof track.genre_analyzed_at_ms === "number" &&
    Number.isSafeInteger(track.genre_analyzed_at_ms) &&
    track.genre_analyzed_at_ms >= 0 &&
    typeof track.genre_raw_score === "number" &&
    Number.isFinite(track.genre_raw_score);
  if (!linked || !validEvidence) return "unavailable";
  return formGenre === track.genre ? "available" : "needs-save";
}

export function maestGenreWriteArguments(sessionId: string, scanId: string, genre: string) {
  return { request: { sessionId, scanId, genre } } as const;
}

export function invokeMaestGenreWritePreview(
  core: TauriCore,
  sessionId: string,
  scanId: string,
  genre: string,
) {
  return core.invoke<MaestGenreWritePreview>(
    "preview_maest_genre_write",
    maestGenreWriteArguments(sessionId, scanId, genre),
  );
}

export function invokeMaestGenreWrite(
  core: TauriCore,
  sessionId: string,
  scanId: string,
  genre: string,
) {
  return core.invoke<MaestGenreWriteResult>(
    "apply_maest_genre_write",
    maestGenreWriteArguments(sessionId, scanId, genre),
  );
}

export function metadataWriteErrorMessage(error: unknown, locale: "es" | "en") {
  const safe = error && typeof error === "object" ? (error as CommandError) : {};
  const code = typeof safe.code === "string" ? safe.code : "";
  const en = locale === "en";
  const messages: Record<string, [string, string]> = {
    scan_session_unavailable: ["El escaneo local ya no está activo.", "The local scan is no longer active."],
    track_not_in_session: ["La pista ya no está vinculada al escaneo activo.", "The track is no longer linked to the active scan."],
    track_unavailable: ["El archivo local ya no está disponible.", "The local file is no longer available."],
    track_changed: ["El archivo cambió. Vuelve a escanearlo antes de escribir.", "The file changed. Scan it again before writing."],
    preview_required: ["Previsualiza de nuevo la escritura antes de confirmar.", "Preview the write again before confirming."],
    file_not_writable: ["El archivo no se puede escribir.", "The file cannot be written."],
    tag_not_writable: ["El formato no admite escribir esta etiqueta.", "This format does not support writing this tag."],
    backup_failed: ["No se pudo crear la copia de seguridad.", "The backup could not be created."],
    write_failed: ["No se pudo escribir el género; se conservó el archivo original.", "The genre could not be written; the original file was preserved."],
    verification_failed: ["No se pudo verificar la escritura; se restauró el original.", "The write could not be verified; the original was restored."],
    undo_failed: ["No se pudo deshacer la escritura de forma segura.", "The write could not be safely undone."],
    restore_failed: ["No se pudo restaurar automáticamente el original. Conserva la copia de seguridad y no vuelvas a escribir.", "The original could not be restored automatically. Keep the backup and do not write again."],
    link_state_failed: ["No se pudo conservar el vínculo local. El archivo original fue restaurado.", "The local link could not be preserved. The original file was restored."],
  };
  return messages[code]?.[en ? 1 : 0] ?? (en ? "The file operation could not be completed." : "No se pudo completar la operación con el archivo.");
}
