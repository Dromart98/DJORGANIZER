import { describe, expect, it } from "vitest";
import { DESKTOP_MAEST_ANALYZER, DESKTOP_MAEST_COMPATIBILITY_KEY } from "@/lib/desktop/maest-analysis";
import { maestBatchTrackUpdate, parseMaestBatchApplications } from "./maest-batch-apply";

const id = "00000000-0000-4000-8000-000000000001";
const evidence = { value: "House", analyzerId: DESKTOP_MAEST_ANALYZER.id, analyzerVersion: DESKTOP_MAEST_ANALYZER.version, compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY, analyzedAt: "123", rawScore: .8 } as const;
const application = { trackId: id, expected: { genre: "Rock", subgenre: null }, fields: { genre: evidence } };

describe("MAEST batch application contract", () => {
  it("builds independent automatic updates with complete evidence", () => {
    expect(maestBatchTrackUpdate(application)).toEqual({
      appliedFields: ["genre"],
      update: { genre: "House", genre_source: "automatic", genre_confidence: null, genre_analyzer_id: evidence.analyzerId, genre_analyzer_version: evidence.analyzerVersion, genre_compatibility_key: evidence.compatibilityKey, genre_analyzed_at_ms: 123, genre_raw_score: .8 },
    });
    expect(maestBatchTrackUpdate({ ...application, fields: { subgenre: { ...evidence, value: "Deep House" } } }).appliedFields).toEqual(["subgenre"]);
    expect(maestBatchTrackUpdate({ ...application, fields: { genre: evidence, subgenre: { ...evidence, value: "Deep House" } } }).appliedFields).toEqual(["genre", "subgenre"]);
  });

  it("does not erase or rewrite a field for a missing or unchanged proposal", () => {
    expect(maestBatchTrackUpdate({ ...application, expected: { genre: "House", subgenre: null } })).toEqual({ update: {}, appliedFields: [] });
  });

  it.each([
    { analyzerId: "tampered" }, { analyzerVersion: "tampered" },
    { compatibilityKey: "tampered" }, { analyzedAt: "-1" }, { rawScore: Number.NaN }, { value: "" },
  ])("rejects manipulated evidence %#", (change) => {
    const parsed = parseMaestBatchApplications([{ ...application, fields: { genre: { ...evidence, ...change } } }]);
    expect(parsed.applications).toEqual([]);
    expect(parsed.rejectedTrackIds).toEqual([id]);
  });

  it("keeps valid tracks when another item is invalid", () => {
    const secondId = "00000000-0000-4000-8000-000000000002";
    const parsed = parseMaestBatchApplications([application, { ...application, trackId: secondId, fields: { genre: { ...evidence, analyzerId: "bad" } } }]);
    expect(parsed.applications).toHaveLength(1);
    expect(parsed.rejectedTrackIds).toEqual([secondId]);
  });

  it("rejects more than the current batch limit", () => {
    expect(parseMaestBatchApplications(Array.from({ length: 26 }, () => application)).applications).toEqual([]);
  });
});
