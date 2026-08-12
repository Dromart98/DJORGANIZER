import { describe, expect, it } from "vitest";
import type { ImportTrackInput } from "@/lib/import/import-schema";
import { needsLocalGenreSuggestion } from "./import-analysis";

const input = {
  genre: null,
  subgenre: null,
} as ImportTrackInput;

describe("automatic local genre import eligibility", () => {
  it("analyzes when either structured field is missing", () => {
    expect(needsLocalGenreSuggestion(input)).toBe(true);
    expect(
      needsLocalGenreSuggestion({
        ...input,
        genre: "Electronic",
        genre_source: "manual",
      }),
    ).toBe(true);
    expect(
      needsLocalGenreSuggestion({
        ...input,
        subgenre: "Techno",
        subgenre_source: "manual",
      }),
    ).toBe(true);
  });

  it("skips a track that already has both accepted fields", () => {
    expect(
      needsLocalGenreSuggestion({
        ...input,
        genre: "Electronic",
        subgenre: "Techno",
      }),
    ).toBe(false);
  });
});
