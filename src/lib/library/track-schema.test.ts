import { describe, expect, it } from "vitest";
import {
  toTrackInsert,
  toTrackUpdate,
  trackFormSchema,
  trackIdsSchema,
} from "./track-schema";

const persistedAnalysis = {
  bpm: 128,
  bpm_confidence: 0.9,
  bpm_explanation: "Automatic BPM evidence",
  bpm_source: "automatic",
  camelot_key: "8A",
  energy: 8,
  energy_confidence: 0.8,
  energy_source: "automatic",
  genre: "Electronic",
  genre_confidence: 0.7,
  genre_source: "automatic",
  key_confidence: 0.85,
  key_explanation: "Automatic key evidence",
  key_source: "automatic",
  musical_key: "Am",
  subgenre: "Techno",
  subgenre_confidence: 0.75,
  subgenre_source: "automatic",
};

const editableValues = {
  album: "Album",
  artist: "Artist",
  bpm: 128,
  camelot_key: "8A",
  comments: "Updated comment",
  duration_seconds: 240,
  energy: 8,
  genre: "Electronic",
  musical_key: "A minor",
  rating: 5,
  release_year: 2026,
  subgenre: "Techno",
  title: "Updated title",
};

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

  it("preserva toda la evidencia musical al editar solo metadatos", () => {
    const update = toTrackUpdate(editableValues, persistedAnalysis);

    expect(update).not.toHaveProperty("bpm_source");
    expect(update).not.toHaveProperty("bpm_confidence");
    expect(update).not.toHaveProperty("bpm_explanation");
    expect(update).not.toHaveProperty("key_source");
    expect(update).not.toHaveProperty("key_confidence");
    expect(update).not.toHaveProperty("key_explanation");
    expect(update).not.toHaveProperty("energy_source");
    expect(update).not.toHaveProperty("energy_confidence");
    expect(update).not.toHaveProperty("genre_source");
    expect(update).not.toHaveProperty("genre_confidence");
    expect(update).not.toHaveProperty("subgenre_source");
    expect(update).not.toHaveProperty("subgenre_confidence");
  });

  it.each([
    ["bpm", { bpm: 130 }, ["bpm_source", "bpm_confidence"]],
    ["key", { musical_key: "C", camelot_key: "8B" }, ["key_source", "key_confidence"]],
    ["energy", { energy: 9 }, ["energy_source", "energy_confidence"]],
    ["genre", { genre: "House" }, ["genre_source", "genre_confidence"]],
    ["subgenre", { subgenre: "Deep House" }, ["subgenre_source", "subgenre_confidence"]],
  ])("marca solo %s como manual cuando cambia", (_field, changes, evidence) => {
    const update = toTrackUpdate(
      { ...editableValues, ...changes },
      persistedAnalysis,
    );

    expect(update[evidence[0] as keyof typeof update]).toBe("manual");
    expect(update[evidence[1] as keyof typeof update]).toBeNull();
  });

  it("limpia la evidencia al borrar cada valor musical", () => {
    const update = toTrackUpdate(
      {
        ...editableValues,
        bpm: undefined,
        camelot_key: null,
        energy: undefined,
        genre: null,
        musical_key: null,
        subgenre: null,
      },
      persistedAnalysis,
    );

    expect(update).toMatchObject({
      bpm: null,
      bpm_confidence: null,
      bpm_explanation: null,
      bpm_source: null,
      energy: null,
      energy_confidence: null,
      energy_source: null,
      genre: null,
      genre_confidence: null,
      genre_source: null,
      key_confidence: null,
      key_explanation: null,
      key_source: null,
      musical_key: null,
      subgenre: null,
      subgenre_confidence: null,
      subgenre_source: null,
    });
  });
});

describe("trackIdsSchema", () => {
  it("rechaza una selección vacía", () => {
    expect(trackIdsSchema.safeParse([]).success).toBe(false);
  });
});
