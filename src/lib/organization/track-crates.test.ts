import { describe, expect, it } from "vitest";
import { sortTrackCrates } from "./track-crates";

describe("sortTrackCrates", () => {
  it("sorts case-insensitively by name and breaks ties by id", () => {
    expect(
      sortTrackCrates([
        { id: "3", name: "Zulu" },
        { id: "2", name: "alpha" },
        { id: "1", name: "Alpha" },
      ]),
    ).toEqual([
      { id: "1", name: "Alpha" },
      { id: "2", name: "alpha" },
      { id: "3", name: "Zulu" },
    ]);
  });
});
