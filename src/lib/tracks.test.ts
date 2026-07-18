import { describe, expect, it } from "vitest";
import { demoTracks } from "@/data/demo-tracks";
import { formatDuration, sortTracks } from "./tracks";

describe("track helpers", () => {
  it("formats durations as minutes and seconds", () => expect(formatDuration(376)).toBe("6:16"));
  it("sorts without mutating the source collection", () => {
    const sorted = sortTracks(demoTracks, "bpm", "desc");
    expect(sorted[0]?.bpm).toBe(132);
    expect(demoTracks[0]?.bpm).toBe(122);
  });
});
