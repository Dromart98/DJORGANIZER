import type { ImportTrackInput } from "@/lib/import/import-schema";
import type { LocalGenreSuggestion } from "./types";

export function applyLocalGenreSuggestion(
  input: ImportTrackInput,
  suggestion: LocalGenreSuggestion,
): ImportTrackInput {
  return {
    ...input,
    genre: suggestion.label,
    genre_confidence: suggestion.score,
    // The existing database contract has no "automatic" value and migrations are
    // deliberately outside this proof of concept. Manual acceptance is the
    // Provider-neutral persisted provenance; analyzer details remain internal.
    genre_source: "automatic",
  };
}

export function rejectLocalGenreSuggestion(input: ImportTrackInput) {
  return input;
}
