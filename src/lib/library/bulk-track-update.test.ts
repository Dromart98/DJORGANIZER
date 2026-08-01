import { describe, expect, it } from "vitest";
import { parseBulkTrackUpdate } from "@/lib/library/bulk-track-update";

const trackIds = ["9353b26b-cf05-4fa9-8d93-6f36743522af"];

describe("parseBulkTrackUpdate", () => {
  it("trims text and creates a partial update", () => {
    expect(
      parseBulkTrackUpdate({ field: "genre", trackIds, value: "  House  " }),
    ).toEqual({
      field: "genre",
      trackIds,
      update: {
        genre: "House",
        genre_analyzed_at_ms: null,
        genre_analyzer_id: null,
        genre_analyzer_version: null,
        genre_compatibility_key: null,
        genre_confidence: null,
        genre_raw_score: null,
        genre_source: "manual",
      },
    });
  });

  it.each([
    ["genre", "House"],
    ["subgenre", "Deep House"],
  ] as const)("clears only %s MAEST evidence for a manual bulk edit", (field, value) => {
    const update = parseBulkTrackUpdate({ field, trackIds, value }).update;
    expect(update).toMatchObject({
      [field]: value,
      [`${field}_analyzed_at_ms`]: null,
      [`${field}_analyzer_id`]: null,
      [`${field}_analyzer_version`]: null,
      [`${field}_compatibility_key`]: null,
      [`${field}_confidence`]: null,
      [`${field}_raw_score`]: null,
      [`${field}_source`]: "manual",
    });
    const other = field === "genre" ? "subgenre" : "genre";
    expect(Object.keys(update).some((key) => key.startsWith(`${other}_`))).toBe(false);
  });

  it.each(["genre", "subgenre"] as const)(
    "clears %s provenance and MAEST evidence for an empty bulk edit",
    (field) => {
      expect(parseBulkTrackUpdate({ field, trackIds, value: "" }).update).toMatchObject({
        [field]: null,
        [`${field}_analyzer_id`]: null,
        [`${field}_analyzer_version`]: null,
        [`${field}_compatibility_key`]: null,
        [`${field}_analyzed_at_ms`]: null,
        [`${field}_raw_score`]: null,
        [`${field}_confidence`]: null,
        [`${field}_source`]: null,
      });
    },
  );

  it("normalizes musical keys and derives Camelot", () => {
    expect(
      parseBulkTrackUpdate({ field: "musical_key", trackIds, value: "A minor" }),
    ).toEqual({
      field: "musical_key",
      trackIds,
      update: {
        camelot_key: "8A",
        key_confidence: null,
        key_explanation: "Valor revisado manualmente.",
        key_source: "manual",
        musical_key: "Am",
      },
    });
  });

  it("uses an empty value to clear a field", () => {
    expect(
      parseBulkTrackUpdate({ field: "rating", trackIds, value: "" }).update,
    ).toEqual({ rating: null });
  });

  it("rejects invalid ranges and empty selections", () => {
    expect(() =>
      parseBulkTrackUpdate({ field: "bpm", trackIds, value: "301" }),
    ).toThrow();
    expect(() =>
      parseBulkTrackUpdate({ field: "genre", trackIds: [], value: "House" }),
    ).toThrow();
  });
});
