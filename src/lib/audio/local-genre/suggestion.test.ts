import { describe, expect, it } from "vitest";
import type { ImportTrackInput } from "@/lib/import/import-schema";
import { applyLocalGenreSuggestion, rejectLocalGenreSuggestion } from "./suggestion";

const input: ImportTrackInput = {
  acoustic_fingerprint: null,
  album: null,
  artist: null,
  bpm: null,
  bpm_confidence: null,
  bpm_explanation: null,
  bpm_source: null,
  client_id: "d6d34945-a12a-4c9c-a1d7-066abf568a44",
  duration_seconds: 60,
  energy_confidence: null,
  energy_source: null,
  energy: null,
  file_fingerprint: "a".repeat(64),
  file_name: "synthetic.wav",
  file_size: 100,
  file_type: "audio/wav",
  genre: "Previous",
  genre_confidence: null,
  subgenre: null,
  subgenre_confidence: null,
  subgenre_source: null,
  genre_source: "manual",
  key_confidence: null,
  key_explanation: null,
  key_source: null,
  musical_key: null,
  release_year: null,
  title: "Synthetic",
  version_type: "unknown",
};

const suggestion = {
  alternatives: [],
  backend: "wasm",
  genre: "Electronic",
  score: 0.82,
  subgenre: "Techno",
};

describe("local suggestion review", () => {
  it("preserves a manual genre and fills only the missing subgenre", () => {
    const accepted = applyLocalGenreSuggestion(input, suggestion);
    expect(accepted.genre).toBe("Previous");
    expect(accepted.genre_source).toBe("manual");
    expect(accepted.subgenre).toBe("Techno");
    expect(accepted.subgenre_confidence).toBe(0.82);
    expect(accepted.subgenre_source).toBe("automatic");
    expect(accepted.title).toBe(input.title);
    expect(input.genre).toBe("Previous");
  });

  it("fills both empty fields independently with automatic provenance", () => {
    const accepted = applyLocalGenreSuggestion(
      { ...input, genre: null, genre_source: null },
      suggestion,
    );
    expect(accepted).toMatchObject({
      genre: "Electronic",
      genre_confidence: 0.82,
      genre_source: "automatic",
      subgenre: "Techno",
      subgenre_confidence: 0.82,
      subgenre_source: "automatic",
    });
  });

  it("preserves the previous genre when rejected", () => {
    expect(rejectLocalGenreSuggestion(input)).toBe(input);
  });
});
