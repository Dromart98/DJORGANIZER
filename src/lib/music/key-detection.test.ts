import { describe, expect, it } from "vitest";
import { estimateMusicalKey } from "@/lib/music/key-detection";

describe("estimateMusicalKey", () => {
  it("identifies a C major profile and derives Camelot", () => {
    expect(
      estimateMusicalKey([
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29,
        2.88,
      ]),
    ).toMatchObject({
      camelotKey: "8B",
      musicalKey: "C",
      runnerUpKey: expect.any(String),
    });
  });

  it("identifies an A minor profile after rotation", () => {
    expect(
      estimateMusicalKey([
        5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17, 6.33, 2.68,
        3.52,
      ]),
    ).toMatchObject({ camelotKey: "8A", musicalKey: "Am" });
  });

  it("rejects empty or malformed chroma profiles", () => {
    expect(estimateMusicalKey(Array(12).fill(0))).toBeNull();
    expect(estimateMusicalKey([1, 2, 3])).toBeNull();
  });

  it("returns bounded confidence and explains the nearest alternative", () => {
    const result = estimateMusicalKey([
      6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29,
      2.88,
    ]);

    expect(result?.confidence).toBeGreaterThanOrEqual(0);
    expect(result?.confidence).toBeLessThanOrEqual(1);
    expect(result?.explanation).toMatch(/alternativa/i);
  });
});

