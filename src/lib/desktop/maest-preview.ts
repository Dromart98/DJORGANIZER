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
