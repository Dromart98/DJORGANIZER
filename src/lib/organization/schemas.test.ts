import { describe, expect, it } from "vitest";
import {
  crateValuesSchema,
  moveTrackIds,
  tagAssignmentSchema,
} from "@/lib/organization/schemas";

describe("crateValuesSchema", () => {
  it("trims values and normalizes an empty description", () => {
    expect(
      crateValuesSchema.parse({
        description: "  ",
        name: "  Warm up  ",
        parent_id: null,
      }),
    ).toEqual({ description: null, name: "Warm up", parent_id: null });
  });
});

describe("tagAssignmentSchema", () => {
  it("limits a bulk tag operation to 100 tracks", () => {
    expect(
      tagAssignmentSchema.safeParse({
        tagId: "227830d0-3c7a-4f3b-90f9-5c565b66f39a",
        trackIds: Array(101).fill(
          "ef5b5aa1-9d49-47f6-a09e-323bbf8de013",
        ),
      }).success,
    ).toBe(false);
  });
});

describe("moveTrackIds", () => {
  it("moves a track one position without mutating the source", () => {
    const source = ["one", "two", "three"];
    expect(moveTrackIds(source, "two", "down")).toEqual([
      "one",
      "three",
      "two",
    ]);
    expect(source).toEqual(["one", "two", "three"]);
  });

  it("keeps boundary tracks in place", () => {
    expect(moveTrackIds(["one", "two"], "one", "up")).toEqual([
      "one",
      "two",
    ]);
  });
});
