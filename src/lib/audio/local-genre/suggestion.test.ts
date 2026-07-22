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
  energy: null,
  file_fingerprint: "a".repeat(64),
  file_name: "synthetic.wav",
  file_size: 100,
  file_type: "audio/wav",
  genre: "Previous",
  genre_confidence: null,
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
  label: "Electronic · Techno",
  score: 0.82,
};

describe("local suggestion review", () => {
  it("changes only temporary genre fields when accepted", () => {
    const accepted = applyLocalGenreSuggestion(input, suggestion);
    expect(accepted.genre).toBe("Electronic · Techno");
    expect(accepted.genre_confidence).toBe(0.82);
    expect(accepted.genre_source).toBe("manual");
    expect(accepted.title).toBe(input.title);
    expect(input.genre).toBe("Previous");
  });

  it("preserves the previous genre when rejected", () => {
    expect(rejectLocalGenreSuggestion(input)).toBe(input);
  });
});
