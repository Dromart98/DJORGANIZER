import { describe, expect, it } from "vitest";
import { canApplyAutomaticValue, canReuseAutomaticResult, type MusicAnalysisResult } from "./analysis-contract";

const result: MusicAnalysisResult = {
  analyzer: { id: "discogs-effnet", version: "1" },
  compatibilityKey: "fingerprint:settings-v1",
  fields: { bpm: { field: "bpm", source: "automatic", status: "completed", proposedValue: 124 } },
};

describe("music analysis contract", () => {
  it("protects manual values from automatic replacement", () => {
    expect(canApplyAutomaticValue("manual")).toBe(false);
    expect(canApplyAutomaticValue("unknown")).toBe(true);
  });
  it("reuses only analyzer-compatible results", () => {
    expect(canReuseAutomaticResult(result, result.analyzer, result.compatibilityKey)).toBe(true);
    expect(canReuseAutomaticResult(result, { ...result.analyzer, version: "2" }, result.compatibilityKey)).toBe(false);
  });
});
