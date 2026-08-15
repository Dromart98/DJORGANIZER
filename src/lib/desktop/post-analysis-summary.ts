import type { MaestBatchItem, MaestBatchState } from "./maest-batch";
import { maestFormProposal } from "./maest-preview";

export type PostAnalysisSummary = {
  ambiguous: number;
  duplicates: number;
  failed: number;
  omitted: number;
  ready: number;
};

export const EMPTY_POST_ANALYSIS_SUMMARY: PostAnalysisSummary = {
  ambiguous: 0,
  duplicates: 0,
  failed: 0,
  omitted: 0,
  ready: 0,
};

function completedItemNeedsReview(item: MaestBatchItem) {
  return Boolean(
    !item.result ||
      item.result.analysis.partialErrors.length > 0 ||
      !maestFormProposal(item.result),
  );
}

export function summarizePostAnalysis(
  items: readonly MaestBatchItem[],
  phase?: MaestBatchState["phase"],
): PostAnalysisSummary {
  return items.reduce<PostAnalysisSummary>(
    (summary, item) => {
      if (item.status === "already_analyzed") {
        summary.ready += 1;
      } else if (item.status === "completed") {
        if (completedItemNeedsReview(item)) summary.ambiguous += 1;
        else summary.ready += 1;
      } else if (item.status === "failed") {
        summary.failed += 1;
      } else if (item.status === "cancelled" || item.status === "skipped") {
        summary.omitted += 1;
      } else if (
        phase === "blocked" &&
        ["pending", "preparing", "analyzing"].includes(item.status)
      ) {
        summary.failed += 1;
      } else if (
        phase === "cancelled" &&
        ["pending", "preparing", "analyzing"].includes(item.status)
      ) {
        summary.omitted += 1;
      }
      return summary;
    },
    { ...EMPTY_POST_ANALYSIS_SUMMARY },
  );
}

export function mergePostAnalysisSummaries(
  ...summaries: readonly PostAnalysisSummary[]
): PostAnalysisSummary {
  return summaries.reduce<PostAnalysisSummary>(
    (merged, summary) => ({
      ambiguous: merged.ambiguous + summary.ambiguous,
      duplicates: merged.duplicates + summary.duplicates,
      failed: merged.failed + summary.failed,
      omitted: merged.omitted + summary.omitted,
      ready: merged.ready + summary.ready,
    }),
    { ...EMPTY_POST_ANALYSIS_SUMMARY },
  );
}
