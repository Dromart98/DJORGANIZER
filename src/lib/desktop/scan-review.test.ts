import { describe, expect, it } from "vitest";
import {
  filterScannedTracks,
  paginateScannedTracks,
  type ScannedAudioFile,
} from "./scan-review";

const tracks: ScannedAudioFile[] = [
  {
    name: "Opening.mp3",
    relativePath: "Set/Opening.mp3",
    extension: "mp3",
    sizeBytes: 3,
    metadataRead: true,
    title: "Opening",
    artist: "DJ Aurora",
    album: null,
    genre: "House",
    durationSeconds: 120,
    bpm: 124,
    musicalKey: "Am",
    duplicateGroup: "DUP-001",
  },
  {
    name: "Closing.flac",
    relativePath: "Set/Closing.flac",
    extension: "flac",
    sizeBytes: 4,
    metadataRead: false,
    title: null,
    artist: null,
    album: null,
    genre: null,
    durationSeconds: null,
    bpm: null,
    musicalKey: null,
    duplicateGroup: null,
  },
];

describe("filterScannedTracks", () => {
  it("searches metadata and relative paths without case sensitivity", () => {
    expect(filterScannedTracks(tracks, "aurora", "all")).toEqual([tracks[0]]);
    expect(filterScannedTracks(tracks, "closing", "all")).toEqual([tracks[1]]);
  });

  it("filters exact duplicates and metadata failures", () => {
    expect(filterScannedTracks(tracks, "", "duplicates")).toEqual([tracks[0]]);
    expect(filterScannedTracks(tracks, "", "metadata-errors")).toEqual([
      tracks[1],
    ]);
  });
});

describe("paginateScannedTracks", () => {
  it("returns a bounded page and clamps invalid page numbers", () => {
    const manyTracks = Array.from({ length: 55 }, (_, index) => ({
      ...tracks[0],
      name: `Track ${index}`,
      relativePath: `Track ${index}.mp3`,
    }));

    expect(paginateScannedTracks(manyTracks, 2, 25)).toMatchObject({
      page: 2,
      total: 55,
      totalPages: 3,
    });
    expect(paginateScannedTracks(manyTracks, 99, 25).page).toBe(3);
    expect(paginateScannedTracks(manyTracks, -1, 25).page).toBe(1);
  });
});
