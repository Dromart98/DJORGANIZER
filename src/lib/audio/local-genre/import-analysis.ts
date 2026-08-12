import type { ImportTrackInput } from "@/lib/import/import-schema";

export function needsLocalGenreSuggestion(input: ImportTrackInput) {
  return input.genre === null || input.subgenre === null;
}
