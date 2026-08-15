import { describe, expect, it } from "vitest";
import { sortCrateTracks, type CrateSortTrack } from "./crate-sort";

function track(
  id: string,
  values: Partial<Omit<CrateSortTrack, "id" | "title">> = {},
): CrateSortTrack {
  return {
    artist: null,
    bpm: null,
    camelot_key: null,
    energy: null,
    genre: null,
    id,
    rating: null,
    subgenre: null,
    title: id,
    ...values,
  };
}

describe("sortCrateTracks", () => {
  it("sorts BPM in both directions, keeps empty values last, and preserves ties", () => {
    const tracks = [
      track("empty"),
      track("a", { bpm: 128 }),
      track("b", { bpm: 124 }),
      track("c", { bpm: 128 }),
    ];

    expect(sortCrateTracks(tracks, "bpm", "asc").map(({ id }) => id)).toEqual([
      "b",
      "a",
      "c",
      "empty",
    ]);
    expect(sortCrateTracks(tracks, "bpm", "desc").map(({ id }) => id)).toEqual([
      "a",
      "c",
      "b",
      "empty",
    ]);
  });

  it("orders Camelot numerically instead of lexicographically", () => {
    const tracks = [
      track("ten-a", { camelot_key: "10A" }),
      track("two-b", { camelot_key: "2B" }),
      track("one-b", { camelot_key: "1B" }),
      track("one-a", { camelot_key: "1A" }),
      track("invalid", { camelot_key: "X" }),
    ];

    expect(sortCrateTracks(tracks, "camelot", "asc").map(({ id }) => id)).toEqual([
      "one-a",
      "one-b",
      "two-b",
      "ten-a",
      "invalid",
    ]);
  });

  it("sorts energy and rating without disturbing equal values", () => {
    const tracks = [
      track("first", { energy: 7, rating: 3 }),
      track("second", { energy: 4, rating: 5 }),
      track("third", { energy: 7, rating: 5 }),
    ];

    expect(sortCrateTracks(tracks, "energy", "asc").map(({ id }) => id)).toEqual([
      "second",
      "first",
      "third",
    ]);
    expect(sortCrateTracks(tracks, "rating", "desc").map(({ id }) => id)).toEqual([
      "second",
      "third",
      "first",
    ]);
  });

  it("sorts genre and subgenre alphabetically, keeps blanks last, and preserves ties", () => {
    const tracks = [
      track("blank"),
      track("house-a", { genre: "House", subgenre: "Deep House" }),
      track("techno", { genre: "Techno", subgenre: "Peak Time" }),
      track("house-b", { genre: "house", subgenre: "Afro House" }),
    ];

    expect(sortCrateTracks(tracks, "genre", "asc").map(({ id }) => id)).toEqual([
      "house-a",
      "house-b",
      "techno",
      "blank",
    ]);
    expect(sortCrateTracks(tracks, "subgenre", "asc").map(({ id }) => id)).toEqual([
      "house-b",
      "house-a",
      "techno",
      "blank",
    ]);
  });
});
