import { describe, expect, it } from "vitest";
import {
  compareCrateTrackIds,
  dedupeCrateByExactFingerprint,
  mergeCrateTrackIds,
  sortCrateTrackIds,
  type CrateToolTrack,
} from "./crate-tools";

const tracks: CrateToolTrack[] = [
  {
    artist: "A",
    bpm: 128,
    camelot_key: "10A",
    energy: 7,
    file_fingerprint: "same",
    id: "a",
    rating: 4,
    title: "Alpha",
  },
  {
    artist: "B",
    bpm: 122,
    camelot_key: "2B",
    energy: 9,
    file_fingerprint: "same",
    id: "b",
    rating: 5,
    title: "Beta",
  },
  {
    artist: "C",
    bpm: null,
    camelot_key: null,
    energy: null,
    file_fingerprint: null,
    id: "c",
    rating: null,
    title: "Gamma",
  },
];

describe("crate comparison and merge", () => {
  it("preserves each crate order while separating common and exclusive tracks", () => {
    expect(compareCrateTrackIds(["a", "b"], ["b", "c"])).toEqual({
      common: ["b"],
      leftOnly: ["a"],
      rightOnly: ["c"],
    });
  });

  it("merges into the target without duplicating existing tracks", () => {
    expect(mergeCrateTrackIds(["a", "b"], ["b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("crate sorting", () => {
  it("sorts numeric fields and keeps missing values last", () => {
    expect(sortCrateTrackIds(["a", "b", "c"], tracks, "bpm", "asc")).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortCrateTrackIds(["a", "b", "c"], tracks, "energy", "desc")).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("sorts Camelot by wheel number rather than lexicographically", () => {
    expect(sortCrateTrackIds(["a", "b", "c"], tracks, "camelot", "asc")).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("crate duplicate cleanup", () => {
  it("keeps the first exact fingerprint and leaves tracks without fingerprints alone", () => {
    expect(dedupeCrateByExactFingerprint(["a", "b", "c"], tracks)).toEqual({
      keptTrackIds: ["a", "c"],
      removedTrackIds: ["b"],
    });
  });
});
