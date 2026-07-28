import { describe, expect, it } from "vitest";
import { canApplyAutomaticValue } from "@/lib/music/analysis-contract";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
  type DesktopMaestResult,
  toMusicAnalysisResult,
} from "./maest-analysis";

const baseResult: DesktopMaestResult = {
  analyzer: DESKTOP_MAEST_ANALYZER,
  compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
  partialErrors: [],
  genre: { field: "genre", status: "completed", source: "automatic" },
  subgenre: { field: "subgenre", status: "completed", source: "automatic" },
};

describe("desktop MAEST neutral proposal", () => {
  it("maps existing genre, subgenre and errors without persistence", () => {
    const result = toMusicAnalysisResult({
      ...baseResult,
      genre: { ...baseResult.genre, proposedValue: "Electronic" },
      subgenre: {
        ...baseResult.subgenre,
        proposedValue: "Techno",
        error: { code: "partial", message: "Detalle saneado" },
      },
    });

    expect(result.fields.genre?.proposedValue).toBe("Electronic");
    expect(result.fields.subgenre?.proposedValue).toBe("Techno");
    expect(result.fields.subgenre?.error).toEqual({ code: "partial", message: "Detalle saneado" });
    expect(result.fields.genre?.source).toBe("automatic");
    expect(result.fields.genre).not.toHaveProperty("confidence");
  });

  it("omits nullable Serde options from the domain contract", () => {
    const result = toMusicAnalysisResult({
      ...baseResult,
      genre: { ...baseResult.genre, proposedValue: null, error: null },
      subgenre: { ...baseResult.subgenre, proposedValue: undefined, error: undefined },
    });

    expect(result.fields.genre).not.toHaveProperty("proposedValue");
    expect(result.fields.genre).not.toHaveProperty("error");
    expect(result.fields.subgenre).not.toHaveProperty("proposedValue");
    expect(result.fields.subgenre).not.toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain(":null");
  });

  it("keeps manual corrections protected", () => {
    expect(canApplyAutomaticValue("manual")).toBe(false);
  });
});
