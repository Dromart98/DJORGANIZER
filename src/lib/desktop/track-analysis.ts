import { normalizeMusicalKey } from "@/lib/music/key-normalization";
import type { TauriCore } from "@/lib/desktop/tauri";

export const DESKTOP_TRACK_ANALYZER = {
  id: "djorganizer.desktop.track-analysis",
  version: "native-bpm-key-energy@1",
} as const;

export type NativeAnalysisField<T> = {
  status: "completed" | "failed";
  value: T | null;
  confidence: number | null;
  error: string | null;
};

export type NativeTrackAnalysisResult = {
  scanId: string;
  bpm: NativeAnalysisField<number>;
  musicalKey: NativeAnalysisField<string>;
  camelotKey: NativeAnalysisField<string>;
  energy: NativeAnalysisField<number>;
};

export type NativeTrackEvidence = {
  analyzerId: typeof DESKTOP_TRACK_ANALYZER.id;
  analyzerVersion: typeof DESKTOP_TRACK_ANALYZER.version;
  confidence: number;
  value: number | string;
};

export type NativeTrackProposal = {
  bpm: NativeTrackEvidence | null;
  key: (NativeTrackEvidence & { value: string; camelotValue: string }) | null;
  energy: NativeTrackEvidence | null;
};

const confidence = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

function completedNumber(field: unknown, minimum: number, maximum: number, integer = false) {
  if (!field || typeof field !== "object") return null;
  const candidate = field as Partial<NativeAnalysisField<number>>;
  return candidate.status === "completed" && typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) && candidate.value >= minimum && candidate.value <= maximum &&
    (!integer || Number.isInteger(candidate.value)) && confidence(candidate.confidence)
    ? { analyzerId: DESKTOP_TRACK_ANALYZER.id, analyzerVersion: DESKTOP_TRACK_ANALYZER.version,
        confidence: candidate.confidence, value: candidate.value }
    : null;
}

export function nativeTrackProposal(result: unknown, expectedScanId: string): NativeTrackProposal | null {
  if (!result || typeof result !== "object") return null;
  const value = result as Partial<NativeTrackAnalysisResult>;
  if (value.scanId !== expectedScanId) return null;
  const bpm = completedNumber(value.bpm, 20, 300);
  const energy = completedNumber(value.energy, 0, 10, true);
  const keyField = value.musicalKey;
  const camelotField = value.camelotKey;
  let key: NativeTrackProposal["key"] = null;
  if (keyField?.status === "completed" && camelotField?.status === "completed" &&
      typeof keyField.value === "string" && typeof camelotField.value === "string" &&
      confidence(keyField.confidence) && confidence(camelotField.confidence)) {
    const fromKey = normalizeMusicalKey(keyField.value);
    const fromCamelot = normalizeMusicalKey(camelotField.value);
    if (fromKey && fromCamelot && fromKey.musicalKey === fromCamelot.musicalKey &&
        fromKey.camelotKey === fromCamelot.camelotKey) {
      key = { analyzerId: DESKTOP_TRACK_ANALYZER.id, analyzerVersion: DESKTOP_TRACK_ANALYZER.version,
        confidence: Math.min(keyField.confidence, camelotField.confidence),
        value: fromKey.musicalKey, camelotValue: fromKey.camelotKey };
    }
  }
  return bpm || key || energy ? { bpm, key, energy } : null;
}

export const nativeTrackArguments = (sessionId: string, scanId: string, operationId: string) =>
  ({ request: { sessionId, scanId, operationId } }) as const;

export function invokeNativeTrackAnalysis(core: TauriCore, sessionId: string, scanId: string, operationId: string) {
  return core.invoke<NativeTrackAnalysisResult>("analyze_library_track", nativeTrackArguments(sessionId, scanId, operationId));
}

export function cancelNativeTrackAnalysis(core: TauriCore, sessionId: string, scanId: string, operationId: string) {
  return core.invoke("cancel_library_track_analysis", nativeTrackArguments(sessionId, scanId, operationId));
}
