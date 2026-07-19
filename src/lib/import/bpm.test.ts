import { describe, expect, it } from "vitest";
import {
  bpmAnalysisWindow,
  bpmSampleWindows,
  normalizeDetectedBpm,
  summarizeBpmCandidates,
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

describe("summarizeBpmCandidates", () => {
  it("reports high confidence when three windows agree", () => {
    expect(summarizeBpmCandidates([127.8, 128, 128.2])).toMatchObject({
      bpm: 128,
      windows: 3,
    });
    expect(
      summarizeBpmCandidates([127.8, 128, 128.2])?.confidence,
    ).toBeGreaterThan(0.9);
  });

  it("folds half-time readings and lowers confidence for disagreement", () => {
    expect(summarizeBpmCandidates([64, 128, 140])).toMatchObject({
      bpm: 128,
    });
    expect(
      summarizeBpmCandidates([64, 128, 140])?.confidence,
    ).toBeLessThan(0.5);
  });

  it("splits long analysis into three independent windows", () => {
    expect(
      bpmSampleWindows({ duration: 90, offset: 30 }),
    ).toEqual([
      { duration: 30, offset: 30 },
      { duration: 30, offset: 60 },
      { duration: 30, offset: 90 },
    ]);
  });
});

