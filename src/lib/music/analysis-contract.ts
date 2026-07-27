export const MUSIC_ANALYSIS_FIELDS = [
  "bpm", "musicalKey", "camelotKey", "energy", "genre", "subgenre",
] as const;
export type MusicAnalysisField = (typeof MUSIC_ANALYSIS_FIELDS)[number];
export type AnalysisSource = "automatic" | "metadata" | "manual" | "unknown";
export type AnalysisStatus = "pending" | "running" | "completed" | "failed" | "stale";

export type MusicAnalysisValues = {
  bpm: number;
  musicalKey: string;
  camelotKey: string;
  energy: number;
  genre: string;
  subgenre: string;
};

export type FieldAnalysis<K extends MusicAnalysisField = MusicAnalysisField> = {
  field: K;
  status: AnalysisStatus;
  source: AnalysisSource;
  proposedValue?: MusicAnalysisValues[K];
  confidence?: number;
  error?: { code: string; message: string };
  analyzedAt?: string;
};

export type MusicAnalysisResult = {
  analyzer: { id: string; version: string };
  compatibilityKey: string;
  fields: { [K in MusicAnalysisField]?: FieldAnalysis<K> };
};

export function canReuseAutomaticResult(
  result: MusicAnalysisResult,
  analyzer: MusicAnalysisResult["analyzer"],
  compatibilityKey: string,
) {
  return result.analyzer.id === analyzer.id &&
    result.analyzer.version === analyzer.version &&
    result.compatibilityKey === compatibilityKey;
}

export function canApplyAutomaticValue(source: AnalysisSource | null) {
  return source !== "manual";
}
