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
      update: { genre: "House" },
    });
  });

  it("normalizes musical keys and derives Camelot", () => {
    expect(
      parseBulkTrackUpdate({ field: "musical_key", trackIds, value: "A minor" }),
    ).toEqual({
      field: "musical_key",
      trackIds,
      update: { camelot_key: "8A", musical_key: "Am" },
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
