import { describe, expect, it } from "vitest";
import {
  bpmAnalysisWindow,
  normalizeDetectedBpm,
} from "@/lib/import/bpm";

describe("bpmAnalysisWindow", () => {
  it("analyzes up to 90 seconds and skips long intros", () => {
    expect(bpmAnalysisWindow(245)).toEqual({ duration: 90, offset: 30 });
    expect(bpmAnalysisWindow(75)).toEqual({ duration: 75, offset: 0 });
  });

  it("rejects invalid and excessively short audio", () => {
    expect(bpmAnalysisWindow(4.99)).toBeNull();
    expect(bpmAnalysisWindow(Number.NaN)).toBeNull();
  });
});

describe("normalizeDetectedBpm", () => {
  it("rounds a valid detected tempo to two decimals", () => {
    expect(normalizeDetectedBpm(127.456)).toBe(127.46);
  });

  it("rejects non-finite and out-of-range results", () => {
    expect(normalizeDetectedBpm(Number.POSITIVE_INFINITY)).toBeNull();
    expect(normalizeDetectedBpm(12)).toBeNull();
    expect(normalizeDetectedBpm(400)).toBeNull();
  });
});

