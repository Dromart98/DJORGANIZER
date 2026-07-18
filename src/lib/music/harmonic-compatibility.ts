export type HarmonicMatch = {
  camelotKey: string;
  reason: "Misma tonalidad" | "Tonalidad adyacente" | "Mayor/menor relativo";
};

function parseCamelot(value: string | null | undefined) {
  const match = value?.toUpperCase().match(/^(1[0-2]|[1-9])([AB])$/);
  return match
    ? { letter: match[2], number: Number(match[1]) }
    : null;
}

export function compatibleCamelotKeys(
  value: string | null | undefined,
): HarmonicMatch[] {
  const parsed = parseCamelot(value);
  if (!parsed) return [];
  const previous = parsed.number === 1 ? 12 : parsed.number - 1;
  const next = parsed.number === 12 ? 1 : parsed.number + 1;
  const opposite = parsed.letter === "A" ? "B" : "A";

  return [
    {
      camelotKey: `${parsed.number}${parsed.letter}`,
      reason: "Misma tonalidad",
    },
    {
      camelotKey: `${previous}${parsed.letter}`,
      reason: "Tonalidad adyacente",
    },
    {
      camelotKey: `${next}${parsed.letter}`,
      reason: "Tonalidad adyacente",
    },
    {
      camelotKey: `${parsed.number}${opposite}`,
      reason: "Mayor/menor relativo",
    },
  ];
}

export function compatibleBpmRange(bpm: number | null, tolerance = 0.06) {
  if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) return null;
  return {
    maximum: Math.round(bpm * (1 + tolerance) * 100) / 100,
    minimum: Math.round(bpm * (1 - tolerance) * 100) / 100,
  };
}

