import type { LocalGenreSuggestion } from "./types";

export function displayDiscogsClass(label: string) {
  return label.replace("---", " · ");
}

export function aggregateGenrePredictions(
  predictions: Float32Array,
  patchCount: number,
  classes: readonly string[],
  backend: string,
): LocalGenreSuggestion {
  if (
    patchCount < 1 ||
    classes.length !== 400 ||
    predictions.length !== patchCount * classes.length
  ) {
    throw new Error("La salida del modelo local tiene una forma inesperada.");
  }
  const scores = classes.map((label, classIndex) => {
    let total = 0;
    for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
      const value = predictions[patchIndex * classes.length + classIndex];
      if (!Number.isFinite(value)) {
        throw new Error("El modelo local devolvió un valor no finito.");
      }
      total += value;
    }
    return {
      label: displayDiscogsClass(label),
      score: total / patchCount,
    };
  });
  scores.sort((left, right) => right.score - left.score);
  const [primary, ...alternatives] = scores.slice(0, 5);
  if (!primary) throw new Error("El modelo local no devolvió sugerencias.");
  return {
    alternatives,
    backend,
    label: primary.label,
    score: primary.score,
  };
}
