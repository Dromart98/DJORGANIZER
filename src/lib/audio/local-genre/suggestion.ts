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
    // The existing database contract has no "local" value and migrations are
    // deliberately outside this proof of concept. Manual acceptance is the
    // persisted provenance; the suggestion UI identifies local computation.
    genre_source: "manual",
  };
}

export function rejectLocalGenreSuggestion(input: ImportTrackInput) {
  return input;
}
