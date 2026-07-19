import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENRE_TAXONOMY,
  parseGenreSuggestion,
} from "./genre-classification";

describe("parseGenreSuggestion", () => {
  it("accepts a reviewed taxonomy value", () => {
    expect(
      parseGenreSuggestion(
        '{"genre":"Techno","confidence":0.86,"explanation":"Pulso y timbre."}',
        DEFAULT_GENRE_TAXONOMY,
        "gpt-audio",
      ),
    ).toMatchObject({ confidence: 0.86, genre: "Techno" });
  });

  it("rejects invented genres", () => {
    expect(() =>
      parseGenreSuggestion(
        '{"genre":"Inventado","confidence":0.8}',
        DEFAULT_GENRE_TAXONOMY,
        "gpt-audio",
      ),
    ).toThrow(/válida/i);
  });
});
