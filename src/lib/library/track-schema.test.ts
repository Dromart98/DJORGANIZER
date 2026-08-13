import { describe, expect, it } from "vitest";
import {
  DESKTOP_MAEST_COMPATIBILITY_KEY,
  DESKTOP_MAEST_LEGACY_COMPATIBILITY_KEY,
} from "@/lib/desktop/maest-analysis";
import {
  toTrackInsert,
  toTrackUpdate,
  maestEvidenceFromFormData,
  nativeAnalysisEvidenceFromFormData,
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
  genre_analyzed_at_ms: 1785542400000,
  genre_analyzer_id: "existing-analyzer",
  genre_analyzer_version: "existing-version",
  genre_compatibility_key: "existing-key",
  genre_confidence: 0.7,
  genre_raw_score: 1.2,
  genre_source: "automatic",
  key_confidence: 0.85,
  key_explanation: "Automatic key evidence",
  key_source: "automatic",
  musical_key: "Am",
  subgenre: "Techno",
  subgenre_analyzed_at_ms: 1785542400000,
  subgenre_analyzer_id: "existing-analyzer",
  subgenre_analyzer_version: "existing-version",
  subgenre_compatibility_key: "existing-key",
  subgenre_confidence: 0.75,
  subgenre_raw_score: 1.1,
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

  it("keeps track creation manual and does not accept MAEST provenance", () => {
    const insert = toTrackInsert(
      trackFormSchema.parse({ ...editableValues, camelot_key: "8A" }),
      "user-id",
    );
    expect(insert).toMatchObject({ genre_source: "manual", subgenre_source: "manual" });
    expect(insert).not.toHaveProperty("genre_analyzer_id");
    expect(insert).not.toHaveProperty("subgenre_raw_score");
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
    expect(update).not.toHaveProperty("genre_analyzer_id");
    expect(update).not.toHaveProperty("subgenre_raw_score");
  });

  it("persists matching MAEST evidence only for changed classification fields", () => {
    const evidence = {
      value: "House",
      analyzerId: "djorganizer.desktop.genre.maest" as const,
      analyzerVersion: "discogs-maest-30s-pw-519l@2" as const,
      compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
      analyzedAt: "1785542400000",
      rawScore: 0.812345,
    } as const;
    const update = toTrackUpdate(
      { ...editableValues, genre: "House", subgenre: "Deep House" },
      persistedAnalysis,
      { genre: evidence, subgenre: { ...evidence, value: "Deep House", rawScore: 0.712345 } },
    );
    expect(update).toMatchObject({
      genre_source: "automatic",
      genre_confidence: null,
      genre_analyzer_id: evidence.analyzerId,
      genre_analyzer_version: evidence.analyzerVersion,
      genre_compatibility_key: evidence.compatibilityKey,
      genre_analyzed_at_ms: 1785542400000,
      genre_raw_score: 0.812345,
      subgenre_source: "automatic",
      subgenre_confidence: null,
      subgenre_raw_score: 0.712345,
    });
  });

  it.each([
    DESKTOP_MAEST_COMPATIBILITY_KEY,
    DESKTOP_MAEST_LEGACY_COMPATIBILITY_KEY,
  ])("accepts current and legacy MAEST evidence without rewriting %s", (compatibilityKey) => {
    const formData = new FormData();
    formData.set("maest_evidence", JSON.stringify({ genre: {
      value: "House",
      analyzerId: "djorganizer.desktop.genre.maest",
      analyzerVersion: "discogs-maest-30s-pw-519l@2",
      compatibilityKey,
      analyzedAt: "1785542400000",
      rawScore: 0.8,
    } }));
    expect(maestEvidenceFromFormData(formData).genre?.compatibilityKey).toBe(compatibilityKey);
  });

  it.each([
    ["different value", { value: "Rock" }],
    ["wrong analyzer", { analyzerId: "wrong" }],
    ["wrong version", { analyzerVersion: "wrong" }],
    ["wrong compatibility", { compatibilityKey: "wrong" }],
    ["non-finite score", { rawScore: Number.NaN }],
    ["invalid timestamp", { analyzedAt: "1.5" }],
  ])("degrades %s evidence to a manual edit", (_name, change) => {
    const formData = new FormData();
    formData.set("maest_evidence", JSON.stringify({ genre: {
      value: "House",
      analyzerId: "djorganizer.desktop.genre.maest",
      analyzerVersion: "discogs-maest-30s-pw-519l@2",
      compatibilityKey: "maest-519l|mel-16000-1876x96-f32|v2",
      analyzedAt: "1785542400000",
      rawScore: 0.8,
      ...change,
    } }));
    const update = toTrackUpdate(
      { ...editableValues, genre: "House" },
      persistedAnalysis,
      maestEvidenceFromFormData(formData),
    );
    expect(update).toMatchObject({ genre_source: "manual", genre_analyzer_id: null, genre_raw_score: null });
  });

  it("degrades malformed evidence without blocking a legitimate edit", () => {
    const formData = new FormData();
    formData.set("maest_evidence", "{bad json");
    expect(toTrackUpdate(
      { ...editableValues, genre: "House" },
      persistedAnalysis,
      maestEvidenceFromFormData(formData),
    )).toMatchObject({ genre: "House", genre_source: "manual" });
  });

  it("keeps valid subgenre evidence when genre evidence is invalid", () => {
    const valid = {
      value: "Deep House",
      analyzerId: "djorganizer.desktop.genre.maest",
      analyzerVersion: "discogs-maest-30s-pw-519l@2",
      compatibilityKey: "maest-519l|mel-16000-1876x96-f32|v2",
      analyzedAt: "1785542400000",
      rawScore: 0.7,
    };
    const formData = new FormData();
    formData.set("maest_evidence", JSON.stringify({
      genre: { ...valid, value: "House", analyzerId: "wrong" },
      subgenre: valid,
    }));
    expect(toTrackUpdate(
      { ...editableValues, genre: "House", subgenre: "Deep House" },
      persistedAnalysis,
      maestEvidenceFromFormData(formData),
    )).toMatchObject({ genre_source: "manual", subgenre_source: "automatic" });
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
      genre_analyzer_id: null,
      genre_raw_score: null,
      key_confidence: null,
      key_explanation: null,
      key_source: null,
      musical_key: null,
      subgenre: null,
      subgenre_confidence: null,
      subgenre_source: null,
      subgenre_analyzer_id: null,
      subgenre_raw_score: null,
    });
  });
});

describe("trackIdsSchema", () => {
  it("rechaza una selección vacía", () => {
    expect(trackIdsSchema.safeParse([]).success).toBe(false);
  });
});

describe("native track evidence", () => {
  const evidence = {
    analyzerId: "djorganizer.desktop.track-analysis" as const,
    analyzerVersion: "native-bpm-key-energy@1" as const,
    confidence: 0.84,
  };

  it("preserves automatic provenance for exact accepted values", () => {
    const formData = new FormData();
    formData.set("native_analysis_evidence", JSON.stringify({
      bpm: { ...evidence, value: 126.5 },
      key: { ...evidence, value: "C", camelotValue: "8B" },
      energy: { ...evidence, value: 7 },
    }));
    expect(toTrackUpdate({ ...editableValues, bpm: 126.5, musical_key: "C", camelot_key: "8B", energy: 7 }, persistedAnalysis, {}, nativeAnalysisEvidenceFromFormData(formData)))
      .toMatchObject({ bpm_source: "automatic", bpm_confidence: 0.84, key_source: "automatic", key_confidence: 0.84, energy_source: "automatic", energy_confidence: 0.84 });
  });

  it.each([
    { bpm: { ...evidence, value: 301 } },
    { energy: { ...evidence, value: 4.5 } },
    { key: { ...evidence, value: "C", camelotValue: "8A" } },
    { bpm: { ...evidence, confidence: Number.NaN, value: 128 } },
    { bpm: { ...evidence, analyzerVersion: "tampered", value: 128 } },
  ])("ignores a manipulated field safely", (payload) => {
    const formData = new FormData();
    formData.set("native_analysis_evidence", JSON.stringify({
      ...payload,
      energy: { ...evidence, value: 8 },
    }));
    expect(nativeAnalysisEvidenceFromFormData(formData)).toEqual({
      energy: { ...evidence, value: 8 },
    });
  });

  it("keeps valid key and energy evidence when edited BPM is represented as null", () => {
    const formData = new FormData();
    formData.set("native_analysis_evidence", JSON.stringify({
      bpm: null,
      key: { ...evidence, value: "Am", camelotValue: "8A" },
      energy: { ...evidence, value: 8 },
    }));
    expect(nativeAnalysisEvidenceFromFormData(formData)).toEqual({
      key: { ...evidence, value: "Am", camelotValue: "8A" },
      energy: { ...evidence, value: 8 },
    });
  });

  it("rejects the complete payload when it contains an unknown key", () => {
    const formData = new FormData();
    formData.set("native_analysis_evidence", JSON.stringify({
      energy: { ...evidence, value: 8 },
      unknown: evidence,
    }));
    expect(nativeAnalysisEvidenceFromFormData(formData)).toEqual({});
  });

  it.each([
    ["BPM", { bpm: 128 }, { bpm: { ...evidence, value: 128 } }, { bpm_source: "automatic", bpm_confidence: 0.84 }],
    ["energy", { energy: 8 }, { energy: { ...evidence, value: 8 } }, { energy_source: "automatic", energy_confidence: 0.84 }],
    ["key", { musical_key: "Am", camelot_key: "8A" }, { key: { ...evidence, value: "Am", camelotValue: "8A" } }, { key_source: "automatic", key_confidence: 0.84 }],
  ] as const)("applies accepted %s evidence when the value is unchanged", (_field, values, nativeEvidence, expected) => {
    expect(toTrackUpdate({ ...editableValues, ...values }, persistedAnalysis, {}, nativeEvidence)).toMatchObject(expected);
  });

  it("turns a later edit into manual provenance", () => {
    const update = toTrackUpdate({ ...editableValues, bpm: 129 }, persistedAnalysis, {}, { bpm: { ...evidence, value: 128 } });
    expect(update).toMatchObject({ bpm_source: "manual", bpm_confidence: null });
  });
});
