import type { DesktopMaestResult } from "@/lib/desktop/maest-analysis";
import type { TauriCore } from "@/lib/desktop/tauri";

export type MaestPublicResult = {
  scanId: string;
  analysis: DesktopMaestResult;
};

export type MaestRequestIdentity = {
  requestId: number;
  trackId: string;
  sessionId: string;
  scanId: string;
};

export type MaestLinkIdentity = Omit<MaestRequestIdentity, "requestId">;
export type MaestPreviewPhase = "idle" | "preparing" | "analyzing";
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
};

export type MaestFormProposal = {
  genre: string | null;
  subgenre: string | null;
};

export type MaestPreviewAction =
  | { type: "linkChanged"; identity: MaestLinkIdentity | null }
  | { type: "start"; requestId: number }
  | { type: "prepared"; request: MaestRequestIdentity }
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

export function maestFormProposal(
  result: MaestPublicResult | null,
): MaestFormProposal | null {
  if (!result) return null;
  const proposal = {
    genre: nonEmptyProposal(result.analysis.genre.proposedValue),
    subgenre: nonEmptyProposal(result.analysis.subgenre.proposedValue),
  };
  return proposal.genre || proposal.subgenre ? proposal : null;
}

export function applyMaestFormProposal(
  current: MaestFormFields,
  proposal: MaestFormProposal,
): MaestFormFields {
  return {
    genre: nonEmptyProposal(proposal.genre) ?? current.genre,
    subgenre: nonEmptyProposal(proposal.subgenre) ?? current.subgenre,
  };
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
        activeRequest: { ...state.identity, requestId: action.requestId },
      };
    case "prepared":
      return requestMatchesState(state, action.request)
        ? { ...state, phase: "analyzing" }
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

export function maestAnalyzeArguments(sessionId: string, scanId: string) {
  return { request: { sessionId, scanId } } as const;
}

export async function invokeMaestPreview(
  core: TauriCore,
  sessionId: string,
  scanId: string,
  onPrepared: () => void,
) {
  await core.invoke("prepare_maest_model");
  onPrepared();
  return core.invoke<MaestPublicResult>(
    "analyze_scanned_track",
    maestAnalyzeArguments(sessionId, scanId),
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
  );
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
