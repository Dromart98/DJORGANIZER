import { describe, expect, it } from "vitest";
import {
  toTrackInsert,
  trackFormSchema,
  trackIdsSchema,
} from "./track-schema";

describe("trackFormSchema", () => {
  it("normaliza campos opcionales y Camelot", () => {
    const values = trackFormSchema.parse({
      album: " ",
      artist: "  DJ Test  ",
      bpm: "128.5",
      camelot_key: "8a",
      comments: "",
      duration_seconds: "240",
      energy: "7",
      genre: "House",
      musical_key: "Am",
      rating: "4",
      release_year: "2024",
      title: "  Midnight  ",
    });

    expect(values).toMatchObject({
      album: null,
      artist: "DJ Test",
      bpm: 128.5,
      camelot_key: "8A",
      duration_seconds: 240,
      title: "Midnight",
    });
    expect(toTrackInsert(values, "user-id").user_id).toBe("user-id");
  });

  it("deriva la notación canónica y Camelot desde una tonalidad", () => {
    const values = trackFormSchema.parse({
      album: "",
      artist: "Artist",
      bpm: "",
      camelot_key: "",
      comments: "",
      duration_seconds: "",
      energy: "",
      genre: "",
      musical_key: "A flat minor",
      rating: "",
      release_year: "",
      title: "Track",
    });

    expect(toTrackInsert(values, "user-id")).toMatchObject({
      camelot_key: "1A",
      musical_key: "G♯m",
    });
  });

  it("permite guardar BPM y tonalidad sin artista", () => {
    const values = trackFormSchema.parse({
      album: "",
      artist: "",
      bpm: "128",
      camelot_key: "",
      comments: "",
      duration_seconds: "",
      energy: "",
      genre: "",
      musical_key: "Am",
      rating: "",
      release_year: "",
      title: "Pista sin artista",
    });

    expect(toTrackInsert(values, "user-id")).toMatchObject({
      bpm_confidence: null,
      bpm_source: "manual",
      artist: null,
      bpm: 128,
      camelot_key: "8A",
      key_confidence: null,
      key_source: "manual",
      musical_key: "Am",
    });
  });

  it("rechaza valores musicales fuera de rango", () => {
    const result = trackFormSchema.safeParse({
      album: "",
      artist: "Artist",
      bpm: "500",
      camelot_key: "13C",
      comments: "",
      duration_seconds: "",
      energy: "101",
      genre: "",
      musical_key: "",
      rating: "8",
      release_year: "",
      title: "Track",
    });

    expect(result.success).toBe(false);
  });
});

describe("trackIdsSchema", () => {
  it("rechaza una selección vacía", () => {
    expect(trackIdsSchema.safeParse([]).success).toBe(false);
  });
});
