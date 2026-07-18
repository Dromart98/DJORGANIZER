import { describe, expect, it } from "vitest";
import {
  compatibleBpmRange,
  compatibleCamelotKeys,
} from "@/lib/music/harmonic-compatibility";

describe("compatibleCamelotKeys", () => {
  it("returns exact, adjacent and relative matches", () => {
    expect(compatibleCamelotKeys("8A")).toEqual([
      { camelotKey: "8A", reason: "Misma tonalidad" },
      { camelotKey: "7A", reason: "Tonalidad adyacente" },
      { camelotKey: "9A", reason: "Tonalidad adyacente" },
      { camelotKey: "8B", reason: "Mayor/menor relativo" },
    ]);
  });

  it("wraps around the wheel and rejects malformed values", () => {
    expect(compatibleCamelotKeys("1B").map((match) => match.camelotKey)).toEqual([
      "1B",
      "12B",
      "2B",
      "1A",
    ]);
    expect(compatibleCamelotKeys("13A")).toEqual([]);
  });
});

describe("compatibleBpmRange", () => {
  it("uses a six percent tempo tolerance", () => {
    expect(compatibleBpmRange(125)).toEqual({
      minimum: 117.5,
      maximum: 132.5,
    });
  });
});

