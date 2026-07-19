import { describe, expect, it } from "vitest";
import { formatDuration, sortTracks } from "./tracks";
import type { Track } from "@/types/music";

const tracks: Track[] = [
  {
    artist: null,
    bpm: 122,
    camelot: "8A",
    durationSeconds: 376,
    energy: 64,
    genre: "House",
    id: "one",
    key: "Am",
    tags: [],
    title: "Opening",
  },
  {
    artist: "DJ Test",
    bpm: 132,
    camelot: "4A",
    durationSeconds: 344,
    energy: 91,
    genre: "Techno",
    id: "two",
    key: "Fm",
    tags: [],
    title: "Closing",
  },
];

describe("track helpers", () => {
  it("formats durations as minutes and seconds", () => expect(formatDuration(376)).toBe("6:16"));
  it("sorts without mutating the source collection", () => {
    const sorted = sortTracks(tracks, "bpm", "desc");
    expect(sorted[0]?.bpm).toBe(132);
    expect(tracks[0]?.bpm).toBe(122);
  });
});
