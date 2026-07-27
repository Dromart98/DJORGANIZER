import { describe, expect, it } from "vitest";
import { canApplyAutomaticValue } from "@/lib/music/analysis-contract";
import { DESKTOP_MAEST_ANALYZER, DESKTOP_MAEST_COMPATIBILITY_KEY, toMusicAnalysisResult } from "./maest-analysis";

describe("desktop MAEST neutral proposal", () => {
  it("maps genre and subgenre separately without persistence", () => {
    const result = toMusicAnalysisResult({ analyzer: DESKTOP_MAEST_ANALYZER, compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY, partialErrors: [], genre: { field: "genre", status: "completed", source: "automatic", proposedValue: "Electronic", score: 0.8, analyzedAt: "2026-07-27T00:00:00Z" }, subgenre: { field: "subgenre", status: "completed", source: "automatic", proposedValue: "Techno", score: 0.8, analyzedAt: "2026-07-27T00:00:00Z" } });
    expect(result.fields.genre?.proposedValue).toBe("Electronic"); expect(result.fields.subgenre?.proposedValue).toBe("Techno"); expect(result.fields.genre?.source).toBe("automatic"); expect(result.fields.genre).not.toHaveProperty("confidence");
  });
  it("keeps manual corrections protected", () => { expect(canApplyAutomaticValue("manual")).toBe(false); });
});
