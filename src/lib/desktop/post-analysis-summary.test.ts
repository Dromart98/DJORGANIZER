import { describe, expect, it } from "vitest";
import type { MaestBatchItem } from "./maest-batch";
import { DESKTOP_MAEST_ANALYZER, DESKTOP_MAEST_COMPATIBILITY_KEY } from "./maest-analysis";
import type { MaestPublicResult } from "./maest-preview";
import { summarizePostAnalysis } from "./post-analysis-summary";

const evidence = {
  genre: {
    value: null,
    source: null,
    analyzerId: null,
    analyzerVersion: null,
    compatibilityKey: null,
    analyzedAt: null,
    rawScore: null,
  },
  subgenre: {
    value: null,
    source: null,
    analyzerId: null,
    analyzerVersion: null,
    compatibilityKey: null,
    analyzedAt: null,
    rawScore: null,
  },
};

const completeResult: MaestPublicResult = {
  scanId: "scan",
  analysis: {
    analyzer: DESKTOP_MAEST_ANALYZER,
    compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
    partialErrors: [],
    genre: {
      field: "genre",
      status: "completed",
      source: "automatic",
      proposedValue: "Electronic",
      score: 0.8,
      analyzedAt: "1",
    },
    subgenre: {
      field: "subgenre",
      status: "completed",
      source: "automatic",
      proposedValue: "Techno",
      score: 0.7,
      analyzedAt: "1",
    },
  },
};

function item(
  trackId: string,
  status: MaestBatchItem["status"],
  result?: MaestPublicResult,
): MaestBatchItem {
  return {
    artist: null,
    evidence,
    status,
    title: trackId,
    trackId,
    ...(result ? { result } : {}),
  };
}

describe("post-analysis summary", () => {
  it("keeps successful, ambiguous, failed and omitted outcomes separate", () => {
    const partial: MaestPublicResult = {
      ...completeResult,
      analysis: {
        ...completeResult.analysis,
        partialErrors: [
          { code: "subgenre_unavailable", message: "Subgenre needs review." },
        ],
      },
    };

    expect(
      summarizePostAnalysis([
        item("complete", "completed", completeResult),
        item("existing", "already_analyzed"),
        item("ambiguous", "completed", partial),
        item("failed", "failed"),
        item("cancelled", "cancelled"),
        item("skipped", "skipped"),
      ]),
    ).toEqual({
      ambiguous: 1,
      correct: 2,
      duplicates: 0,
      failed: 1,
      omitted: 2,
    });
  });

  it("treats a completed item without a usable proposal as ambiguous", () => {
    expect(summarizePostAnalysis([item("missing", "completed")])).toMatchObject({
      ambiguous: 1,
      correct: 0,
    });
  });
});
