import type { MaestBatchItem } from "./maest-batch";
import { maestFormProposal } from "./maest-preview";

export type PostAnalysisSummary = {
  ambiguous: number;
  correct: number;
  duplicates: number;
  failed: number;
  omitted: number;
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
): PostAnalysisSummary {
  return items.reduce<PostAnalysisSummary>(
    (summary, item) => {
      if (item.status === "already_analyzed") {
        summary.correct += 1;
      } else if (item.status === "completed") {
        if (completedItemNeedsReview(item)) summary.ambiguous += 1;
        else summary.correct += 1;
      } else if (item.status === "failed") {
        summary.failed += 1;
      } else if (item.status === "cancelled" || item.status === "skipped") {
        summary.omitted += 1;
      }
      return summary;
    },
    {
      ambiguous: 0,
      correct: 0,
      duplicates: 0,
      failed: 0,
      omitted: 0,
    },
  );
}
