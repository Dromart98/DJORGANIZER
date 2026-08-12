import { describe, expect, it } from "vitest";
import {
  isAutomaticAnalysisActive,
  isAutomaticAnalysisEligibleStatus,
} from "@/lib/import/automatic-analysis";

describe("isAutomaticAnalysisActive", () => {
  it("keeps saving blocked until automatic analysis clears its progress", () => {
    expect(isAutomaticAnalysisActive({ completed: 1, total: 2 })).toBe(true);
    expect(isAutomaticAnalysisActive(null)).toBe(false);
  });
});

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
