import { describe, expect, it } from "vitest";
import { createBackup, parseBackup } from "./backup-format";
import { trackRowsForRestore } from "./track-restore";

const evidence = {
  genre_analyzed_at_ms: 1785542400000,
  genre_analyzer_id: "djorganizer.desktop.genre.maest",
  genre_analyzer_version: "discogs-maest-30s-pw-519l@2",
  genre_compatibility_key: "maest-519l|mel-16000-1876x96-f32|v2",
  genre_raw_score: 0.81,
  subgenre_analyzed_at_ms: 1785542400001,
  subgenre_analyzer_id: "djorganizer.desktop.genre.maest",
  subgenre_analyzer_version: "discogs-maest-30s-pw-519l@2",
  subgenre_compatibility_key: "maest-519l|mel-16000-1876x96-f32|v2",
  subgenre_raw_score: 0.71,
};

function backupTrack(track: Record<string, unknown>) {
  const backup = createBackup({
    crateTracks: [],
    crates: [],
    tags: [],
    trackTags: [],
    tracks: [track],
  });
  return parseBackup(JSON.stringify(backup)).data.tracks as Record<string, unknown>[];
}

describe("track backup restoration", () => {
  it("round-trips all MAEST evidence with automatic sources and null confidence", () => {
    const [restored] = trackRowsForRestore(backupTrack({
      id: "track",
      title: "Track",
      genre: "Electronic",
      genre_source: "automatic",
      genre_confidence: null,
      subgenre: "Deep House",
      subgenre_source: "automatic",
      subgenre_confidence: null,
      ...evidence,
    }), "restoring-user");
    expect(restored).toMatchObject({
      ...evidence,
      genre_source: "automatic",
      genre_confidence: null,
      subgenre_source: "automatic",
      subgenre_confidence: null,
      user_id: "restoring-user",
    });
  });

  it("writes null evidence for a manual backup so upsert cannot retain stale values", () => {
    const [restored] = trackRowsForRestore(backupTrack({
      id: "track",
      title: "Manual track",
      genre: "House",
      genre_source: "manual",
      genre_confidence: null,
      subgenre: null,
      subgenre_source: null,
      subgenre_confidence: null,
    }), "restoring-user");
    expect(restored).toMatchObject(Object.fromEntries(
      Object.keys(evidence).map((key) => [key, null]),
    ));
  });

  it("does not add private MAEST inputs to restored track rows", () => {
    const [restored] = trackRowsForRestore(backupTrack({
      id: "track",
      title: "Track",
      ...evidence,
      path: "/private/music.flac",
      sessionId: "session",
      scanId: "scan",
      audio: [1, 2],
      tensor: [3, 4],
    }), "restoring-user");
    expect(JSON.stringify(restored)).not.toMatch(/path|sessionId|scanId|audio|tensor/i);
  });
});
