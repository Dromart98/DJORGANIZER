import { describe, expect, it } from "vitest";
import { compareCrateTrackIds } from "./crate-comparison";

describe("compareCrateTrackIds", () => {
  it("separates common and exclusive tracks while preserving crate order", () => {
    expect(
      compareCrateTrackIds(
        ["left-1", "common-1", "common-2", "left-1"],
        ["right-1", "common-2", "common-1", "right-2"],
      ),
    ).toEqual({
      common: ["common-1", "common-2"],
      leftOnly: ["left-1"],
      rightOnly: ["right-1", "right-2"],
    });
  });

  it("handles empty crates without inventing matches", () => {
    expect(compareCrateTrackIds([], ["track-1"])).toEqual({
      common: [],
      leftOnly: [],
      rightOnly: ["track-1"],
    });
  });
});
