export const DEFAULT_GENRE_TAXONOMY = [
  "Ambient",
  "Bass",
  "Breaks",
  "Deep House",
  "Disco",
  "Drum & Bass",
  "Electro",
  "House",
  "Melodic House & Techno",
  "Organic House",
  "Progressive House",
  "Tech House",
  "Techno",
  "Trance",
] as const;

export type GenreSuggestion = {
  confidence: number;
  explanation: string;
  genre: string;
  model: string;
};

export function parseGenreSuggestion(
  value: string,
  taxonomy: readonly string[],
  model: string,
): GenreSuggestion {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as {
    confidence?: unknown;
    explanation?: unknown;
    genre?: unknown;
  };
  const proposedGenre = parsed.genre;
  const genre =
    typeof proposedGenre === "string"
      ? taxonomy.find(
          (entry) =>
            entry.toLocaleLowerCase("en") ===
            proposedGenre.toLocaleLowerCase("en"),
        )
      : undefined;
  const confidence = Number(parsed.confidence);
  if (
    !genre ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error("La respuesta del clasificador no es válida.");
  }
  return {
    confidence: Math.round(confidence * 100) / 100,
    explanation:
      typeof parsed.explanation === "string"
        ? parsed.explanation.trim().slice(0, 300)
        : "",
    genre,
    model,
  };
}
