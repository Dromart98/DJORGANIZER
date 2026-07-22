import { describe, expect, it } from "vitest";
import { aggregateGenrePredictions } from "./aggregation";

const classes = Array.from({ length: 400 }, (_, index) => `Genre---Style ${index}`);

describe("local genre aggregation", () => {
  it("averages patches and returns a stable top five", () => {
    const values = new Float32Array(800);
    values[4] = 0.8;
    values[404] = 0.6;
    values[3] = 0.5;
    values[403] = 0.5;
    const suggestion = aggregateGenrePredictions(values, 2, classes, "wasm");
    expect(suggestion.label).toBe("Genre · Style 4");
    expect(suggestion.score).toBeCloseTo(0.7);
    expect(suggestion.alternatives).toHaveLength(4);
    expect(suggestion.backend).toBe("wasm");
  });

  it("rejects non-finite model values", () => {
    const values = new Float32Array(400);
    values[2] = Number.NaN;
    expect(() => aggregateGenrePredictions(values, 1, classes, "cpu")).toThrow(
      /no finito/,
    );
  });
});
