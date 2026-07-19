import { describe, expect, it } from "vitest";
import { isAutomaticAnalysisEligibleStatus } from "@/lib/import/automatic-analysis";

describe("isAutomaticAnalysisEligibleStatus", () => {
  it("analyzes files even when required metadata still needs review", () => {
    expect(isAutomaticAnalysisEligibleStatus("invalid")).toBe(true);
  });

  it("analyzes files that are ready to save", () => {
    expect(isAutomaticAnalysisEligibleStatus("ready")).toBe(true);
  });

  it.each(["reading", "fingerprinting", "checking", "duplicate", "saving", "saved", "error"])(
    "does not analyze files in %s state",
    (status) => {
      expect(isAutomaticAnalysisEligibleStatus(status)).toBe(false);
    },
  );
});
