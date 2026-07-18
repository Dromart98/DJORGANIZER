export type BpmAnalysisWindow = {
  duration: number;
  offset: number;
};

const MINIMUM_ANALYSIS_SECONDS = 5;
const MAXIMUM_ANALYSIS_SECONDS = 90;
const LONG_TRACK_SECONDS = 120;
const LONG_TRACK_OFFSET_SECONDS = 30;

export function bpmAnalysisWindow(
  durationSeconds: number,
): BpmAnalysisWindow | null {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < MINIMUM_ANALYSIS_SECONDS
  ) {
    return null;
  }

  const offset =
    durationSeconds > LONG_TRACK_SECONDS ? LONG_TRACK_OFFSET_SECONDS : 0;

  return {
    duration: Math.min(MAXIMUM_ANALYSIS_SECONDS, durationSeconds - offset),
    offset,
  };
}

export function normalizeDetectedBpm(tempo: number) {
  if (!Number.isFinite(tempo) || tempo < 20 || tempo > 300) return null;
  return Math.round(tempo * 100) / 100;
}

