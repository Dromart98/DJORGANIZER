export type BpmAnalysisWindow = {
  duration: number;
  offset: number;
};

export type DetectedBpm = {
  bpm: number;
  confidence: number;
  explanation: string;
  windows: number;
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

export function bpmSampleWindows(window: BpmAnalysisWindow) {
  const samples = window.duration >= 30 ? 3 : window.duration >= 12 ? 2 : 1;
  const duration = window.duration / samples;
  return Array.from({ length: samples }, (_, index) => ({
    duration,
    offset: window.offset + duration * index,
  }));
}

function foldDjTempo(tempo: number) {
  let folded = tempo;
  while (folded < 70) folded *= 2;
  while (folded > 180) folded /= 2;
  return folded;
}

export function summarizeBpmCandidates(
  tempos: readonly number[],
): DetectedBpm | null {
  const folded = tempos
    .map(normalizeDetectedBpm)
    .filter((tempo): tempo is number => tempo !== null)
    .map(foldDjTempo)
    .sort((left, right) => left - right);
  if (!folded.length) return null;

  const middle = Math.floor(folded.length / 2);
  const bpm =
    folded.length % 2
      ? folded[middle]
      : (folded[middle - 1] + folded[middle]) / 2;
  const maximumDeviation = Math.max(
    ...folded.map((tempo) => Math.abs(tempo - bpm) / bpm),
  );
  const coverage = [0, 0.45, 0.72, 1][Math.min(folded.length, 3)];
  const consensus = Math.max(0, 1 - maximumDeviation / 0.08);
  const confidence = Math.round(coverage * consensus * 1000) / 1000;
  const roundedBpm = Math.round(bpm * 100) / 100;
  const agreement =
    confidence >= 0.8 ? "alta" : confidence >= 0.5 ? "media" : "baja";

  return {
    bpm: roundedBpm,
    confidence,
    explanation: `${folded.length} ${folded.length === 1 ? "ventana analizada" : "ventanas analizadas"} con concordancia ${agreement}; revisa posibles lecturas a mitad o doble de tempo.`,
    windows: folded.length,
  };
}

