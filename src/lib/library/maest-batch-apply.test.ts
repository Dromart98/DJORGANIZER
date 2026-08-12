import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
} from "@/lib/desktop/maest-analysis";
import {
  MAX_MAEST_BATCH_APPLY_TRACKS,
  executeMaestBatchApply,
  maestAutomaticClassificationUpdate,
  parseMaestBatchApplyRequest,
  type MaestBatchApplyFieldEvidence,
  type MaestBatchApplyStore,
} from "./maest-batch-apply";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const evidence = (value: string): MaestBatchApplyFieldEvidence => ({
  value,
  analyzerId: DESKTOP_MAEST_ANALYZER.id,
  analyzerVersion: DESKTOP_MAEST_ANALYZER.version,
  compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
  analyzedAt: "123",
  rawScore: 0.7,
});

describe("MAEST batch apply contract", () => {
  it("accepts independent genre and subgenre selections and caps the batch at 25 tracks", () => {
    const items = Array.from({ length: MAX_MAEST_BATCH_APPLY_TRACKS }, (_, index) => ({
      trackId: id(index + 1),
      genre: { expectedValue: null, evidence: evidence("Electronic") },
    }));
    expect(parseMaestBatchApplyRequest({ items }).items).toHaveLength(25);
    expect(() => parseMaestBatchApplyRequest({ items: [...items, { trackId: id(30), genre: { expectedValue: null, evidence: evidence("House") } }] })).toThrow();
  });

  it("rejects duplicate tracks, empty proposals, unknown keys and forged MAEST identity", () => {
    const valid = { trackId: id(1), genre: { expectedValue: null, evidence: evidence("House") } };
    expect(() => parseMaestBatchApplyRequest({ items: [valid, valid] })).toThrow();
    expect(() => parseMaestBatchApplyRequest({ items: [{ trackId: id(1) }] })).toThrow();
    expect(() => parseMaestBatchApplyRequest({ items: [{ ...valid, extra: true }] })).toThrow();
    expect(() => parseMaestBatchApplyRequest({ items: [{ trackId: id(1), genre: { expectedValue: null, evidence: { ...evidence("House"), analyzerVersion: "forged" } } }] })).toThrow();
    expect(() => parseMaestBatchApplyRequest({ items: [{ trackId: id(1), genre: { expectedValue: null, evidence: { ...evidence("House"), compatibilityKey: "legacy-or-forged" } } }] })).toThrow();
    expect(() => parseMaestBatchApplyRequest({ items: [{ trackId: id(1), genre: { expectedValue: null, evidence: { ...evidence(" "), value: " " } } }] })).toThrow();
  });

  it("builds automatic provenance for only the requested field", () => {
    expect(maestAutomaticClassificationUpdate("genre", evidence("Electronic"))).toEqual({
      genre: "Electronic",
      genre_source: "automatic",
      genre_confidence: null,
      genre_analyzer_id: DESKTOP_MAEST_ANALYZER.id,
      genre_analyzer_version: DESKTOP_MAEST_ANALYZER.version,
      genre_compatibility_key: DESKTOP_MAEST_COMPATIBILITY_KEY,
      genre_analyzed_at_ms: 123,
      genre_raw_score: 0.7,
    });
    expect(maestAutomaticClassificationUpdate("subgenre", evidence("Techno"))).toMatchObject({
      subgenre: "Techno",
      subgenre_source: "automatic",
      subgenre_analyzer_id: DESKTOP_MAEST_ANALYZER.id,
    });
  });

  it("applies selected fields independently and preserves partial successes", async () => {
    const current = new Map([[id(1), { genre: "Electronic", subgenre: "House" }]]);
    const store: MaestBatchApplyStore = {
      read: vi.fn(async (trackId) => current.get(trackId) ?? null),
      compareAndSet: vi.fn(async (_trackId, field) => field === "genre" ? "applied" as const : "failed" as const),
    };
    const request = parseMaestBatchApplyRequest({ items: [{
      trackId: id(1),
      genre: { expectedValue: "Electronic", evidence: evidence("Techno") },
      subgenre: { expectedValue: "House", evidence: evidence("Deep House") },
    }] });
    await expect(executeMaestBatchApply(request, store)).resolves.toEqual([{
      trackId: id(1), status: "failed", genre: "applied", subgenre: "failed",
    }]);
  });

  it("detects a stale field before writing and a race during compare-and-set", async () => {
    const compareAndSet = vi.fn(async (_trackId, field) => field === "subgenre" ? "conflict" as const : "applied" as const);
    const store: MaestBatchApplyStore = {
      read: vi.fn(async () => ({ genre: "Manual edit", subgenre: "House" })),
      compareAndSet,
    };
    const request = parseMaestBatchApplyRequest({ items: [{
      trackId: id(1),
      genre: { expectedValue: "Electronic", evidence: evidence("Techno") },
      subgenre: { expectedValue: "House", evidence: evidence("Deep House") },
    }] });
    await expect(executeMaestBatchApply(request, store)).resolves.toEqual([{
      trackId: id(1), status: "conflict", genre: "conflict", subgenre: "conflict",
    }]);
    expect(compareAndSet).toHaveBeenCalledTimes(1);
  });

  it("does not let a missing or inaccessible track abort other tracks", async () => {
    const store: MaestBatchApplyStore = {
      read: vi.fn(async (trackId) => trackId === id(1) ? null : { genre: null, subgenre: null }),
      compareAndSet: vi.fn(async () => "applied" as const),
    };
    const request = parseMaestBatchApplyRequest({ items: [
      { trackId: id(1), genre: { expectedValue: null, evidence: evidence("House") } },
      { trackId: id(2), genre: { expectedValue: null, evidence: evidence("Techno") } },
    ] });
    await expect(executeMaestBatchApply(request, store)).resolves.toEqual([
      { trackId: id(1), status: "failed", genre: "failed", subgenre: "omitted" },
      { trackId: id(2), status: "applied", genre: "applied", subgenre: "omitted" },
    ]);
  });
});
