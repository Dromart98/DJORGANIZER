import { normalizeMusicalKey } from "@/lib/music/key-normalization";

const PITCH_CLASSES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

export type DetectedMusicalKey = {
  camelotKey: string;
  confidence: number;
  explanation: string;
  musicalKey: string;
  runnerUpKey: string | null;
};

function correlation(
  chroma: readonly number[],
  profile: readonly number[],
  root: number,
) {
  const rotated = chroma.map(
    (_, index) => profile[(index - root + profile.length) % profile.length],
  );
  const chromaMean = chroma.reduce((sum, value) => sum + value, 0) / 12;
  const profileMean = rotated.reduce((sum, value) => sum + value, 0) / 12;
  let numerator = 0;
  let chromaPower = 0;
  let profilePower = 0;

  for (let index = 0; index < 12; index += 1) {
    const chromaDelta = chroma[index] - chromaMean;
    const profileDelta = rotated[index] - profileMean;
    numerator += chromaDelta * profileDelta;
    chromaPower += chromaDelta ** 2;
    profilePower += profileDelta ** 2;
  }

  const denominator = Math.sqrt(chromaPower * profilePower);
  return denominator ? numerator / denominator : -1;
}

export function estimateMusicalKey(
  chroma: readonly number[],
): DetectedMusicalKey | null {
  if (
    chroma.length !== 12 ||
    chroma.some((value) => !Number.isFinite(value) || value < 0) ||
    chroma.every((value) => value === 0)
  ) {
    return null;
  }

  const candidates = PITCH_CLASSES.flatMap((pitchClass, root) => [
    {
      label: pitchClass,
      score: correlation(chroma, MAJOR_PROFILE, root),
    },
    {
      label: `${pitchClass}m`,
      score: correlation(chroma, MINOR_PROFILE, root),
    },
  ]).sort((left, right) => right.score - left.score);

  const best = candidates[0];
  const second = candidates[1];
  const normalized = normalizeMusicalKey(best.label);
  const runnerUp = normalizeMusicalKey(second.label);
  if (!normalized) return null;
  const margin = Math.max(0, best.score - second.score);
  const profileStrength = Math.max(0, Math.min(1, (best.score + 1) / 2));
  const separation = Math.max(0, Math.min(1, margin / 0.2));
  const confidence =
    Math.round((profileStrength * 0.35 + separation * 0.65) * 1000) / 1000;
  const clarity =
    confidence >= 0.8 ? "clara" : confidence >= 0.5 ? "moderada" : "ambigua";

  return {
    ...normalized,
    confidence,
    explanation: `Coincidencia cromática ${clarity}; la alternativa más cercana es ${runnerUp?.musicalKey ?? "indeterminada"}.`,
    runnerUpKey: runnerUp?.musicalKey ?? null,
  };
}

