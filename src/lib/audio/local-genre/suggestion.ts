import type { ImportTrackInput } from "@/lib/import/import-schema";
import type { LocalGenreSuggestion } from "./types";

export function applyLocalGenreSuggestion(
  input: ImportTrackInput,
  suggestion: LocalGenreSuggestion,
): ImportTrackInput {
  const appliesGenre = !input.genre || input.genre_source !== "manual";
  const appliesSubgenre = !input.subgenre || input.subgenre_source !== "manual";
  return {
    ...input,
    ...(appliesGenre && !input.genre
      ? {
          genre: suggestion.genre,
          genre_confidence: suggestion.score,
          genre_source: "automatic" as const,
        }
      : {}),
    ...(appliesSubgenre && !input.subgenre
      ? {
          subgenre: suggestion.subgenre,
          subgenre_confidence: suggestion.score,
          subgenre_source: "automatic" as const,
        }
      : {}),
  };
}

export function rejectLocalGenreSuggestion(input: ImportTrackInput) {
  return input;
}
