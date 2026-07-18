import { describe, expect, it } from "vitest";
import { normalizeMusicalKey } from "@/lib/music/key-normalization";

const camelotKeys = Array.from({ length: 12 }, (_, index) => [
  `${index + 1}A`,
  `${index + 1}B`,
]).flat();

describe("normalizeMusicalKey", () => {
  it("supports every Camelot position", () => {
    for (const camelotKey of camelotKeys) {
      expect(normalizeMusicalKey(camelotKey)?.camelotKey).toBe(camelotKey);
    }
  });

  it("normalizes enharmonic, Unicode and verbose notation", () => {
    expect(normalizeMusicalKey(" A♭ minor ")).toEqual({
      camelotKey: "1A",
      musicalKey: "G♯m",
    });
    expect(normalizeMusicalKey("F# major")).toEqual({
      camelotKey: "2B",
      musicalKey: "F♯",
    });
    expect(normalizeMusicalKey("Bb")).toEqual({
      camelotKey: "6B",
      musicalKey: "B♭",
    });
  });

  it("does not invent a result for unknown notation", () => {
    expect(normalizeMusicalKey("unknown")).toBeNull();
    expect(normalizeMusicalKey(null)).toBeNull();
  });
});
