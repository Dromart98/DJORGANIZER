const SIGNATURE_BANDS = 32;

export type AcousticSignature = {
  durationSeconds: number;
  energyEnvelope: number[];
  zeroCrossingEnvelope: number[];
};

export type TrackIdentity = {
  bpm?: number | null;
  durationSeconds?: number | null;
  title: string;
};

export type VersionRelationship =
  | "duplicate"
  | "same-release"
  | "version-or-remix"
  | "unrelated";

export type VersionType =
  | "edit"
  | "live"
  | "original"
  | "remaster"
  | "remix"
  | "unknown";

function normalize(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude > 0 ? values.map((value) => value / magnitude) : values;
}

export function createAcousticSignature(
  samples: ArrayLike<number>,
  sampleRate: number,
): AcousticSignature {
  if (samples.length < SIGNATURE_BANDS || sampleRate <= 0) {
    throw new Error("El fragmento es demasiado corto para crear una firma.");
  }

  const energyEnvelope: number[] = [];
  const zeroCrossingEnvelope: number[] = [];
  const bandSize = Math.floor(samples.length / SIGNATURE_BANDS);

  for (let band = 0; band < SIGNATURE_BANDS; band += 1) {
    const start = band * bandSize;
    const end =
      band === SIGNATURE_BANDS - 1 ? samples.length : start + bandSize;
    let squares = 0;
    let crossings = 0;
    let previous = Number(samples[start]) || 0;

    for (let index = start; index < end; index += 1) {
      const sample = Number(samples[index]) || 0;
      squares += sample * sample;
      if (index > start && (sample >= 0) !== (previous >= 0)) crossings += 1;
      previous = sample;
    }

    energyEnvelope.push(Math.sqrt(squares / Math.max(1, end - start)));
    zeroCrossingEnvelope.push(crossings / Math.max(1, end - start - 1));
  }

  return {
    durationSeconds: samples.length / sampleRate,
    energyEnvelope: normalize(energyEnvelope),
    zeroCrossingEnvelope,
  };
}

function cosine(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / Math.max(1e-9, Math.sqrt(leftMagnitude * rightMagnitude));
}

export function acousticSimilarity(
  left: AcousticSignature,
  right: AcousticSignature,
) {
  const durationRatio =
    Math.min(left.durationSeconds, right.durationSeconds) /
    Math.max(left.durationSeconds, right.durationSeconds, 1e-9);
  const average = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const leftCrossings = average(left.zeroCrossingEnvelope);
  const rightCrossings = average(right.zeroCrossingEnvelope);
  const crossingRatio =
    Math.min(leftCrossings, rightCrossings) /
    Math.max(leftCrossings, rightCrossings, 1e-9);
  const envelope =
    cosine(left.energyEnvelope, right.energyEnvelope) * 0.65 +
    cosine(left.zeroCrossingEnvelope, right.zeroCrossingEnvelope) * 0.1 +
    crossingRatio * 0.25;
  return Math.max(0, Math.min(1, envelope * durationRatio));
}

const VERSION_WORDS =
  /\b(original|club|remix|mix|edit|version|vip|dub|radio|extended|instrumental|acapella|live|remaster(?:ed)?)\b/gi;

function baseTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(VERSION_WORDS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function inferVersionType(title: string): VersionType {
  const normalized = title.toLocaleLowerCase("en");
  if (/\bremaster(?:ed)?\b/.test(normalized)) return "remaster";
  if (/\blive\b/.test(normalized)) return "live";
  if (/\b(remix|mix|vip|dub)\b/.test(normalized)) return "remix";
  if (/\b(edit|radio|extended)\b/.test(normalized)) return "edit";
  return normalized.trim() ? "original" : "unknown";
}

export function detectVersionRelationship(
  left: TrackIdentity,
  right: TrackIdentity,
  similarity: number,
): VersionRelationship {
  if (similarity >= 0.985) return "duplicate";
  const sameBaseTitle =
    baseTitle(left.title).length > 0 &&
    baseTitle(left.title) === baseTitle(right.title);
  const durationDelta = Math.abs(
    (left.durationSeconds ?? 0) - (right.durationSeconds ?? 0),
  );
  const bpmDelta = Math.abs((left.bpm ?? 0) - (right.bpm ?? 0));

  if (sameBaseTitle && similarity >= 0.9 && durationDelta <= 3) {
    return "same-release";
  }
  if (
    sameBaseTitle &&
    similarity >= 0.58 &&
    (durationDelta > 3 || bpmDelta > 0.5)
  ) {
    return "version-or-remix";
  }
  return "unrelated";
}
