import { describe, expect, it } from "vitest";
import { createBackup, parseBackup } from "./backup-format";

describe("backup format", () => {
  it("round-trips a versioned backup", () => {
    const backup = createBackup(
      {
        crateTracks: [],
        crates: [{ id: "crate" }],
        tags: [],
        trackTags: [],
        tracks: [{ id: "track" }],
      },
      new Date("2026-07-19T12:00:00Z"),
    );
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it("migrates realistic version 1 provenance exactly once and preserves relations", () => {
    const legacy = {
      createdAt: "2026-07-19T12:00:00.000Z",
      product: "DJOrganizer",
      version: 1,
      data: {
        tracks: [
          {
            id: "automatic-track",
            bpm_source: "local",
            bpm_confidence: 0.9,
            key_source: "local",
            key_confidence: 0.8,
            genre_source: "openai",
            genre_confidence: 0.7,
            energy: 99,
          },
          {
            id: "manual-track",
            genre_source: "manual",
            genre_confidence: null,
          },
          {
            id: "accepted-discogs-track",
            genre_source: "manual",
            genre_confidence: 0.82,
          },
        ],
        crates: [{ id: "crate" }],
        crateTracks: [{ crate_id: "crate", track_id: "track", position: 0 }],
        tags: [{ id: "tag" }],
        trackTags: [{ tag_id: "tag", track_id: "track" }],
      },
    };
    const migrated = parseBackup(JSON.stringify(legacy));
    expect(migrated.version).toBe(2);
    expect(migrated.data.tracks).toEqual([
      expect.objectContaining({
        bpm_source: "automatic",
        energy: 10,
        energy_source: "unknown",
        genre_source: "automatic",
        key_source: "automatic",
      }),
      expect.objectContaining({ genre_source: "manual", genre_confidence: null }),
      expect.objectContaining({ genre_source: "automatic", genre_confidence: 0.82 }),
    ]);
    expect(migrated.data.crateTracks).toEqual(legacy.data.crateTracks);
    expect(migrated.data.tags).toEqual(legacy.data.tags);
    expect(migrated.data.trackTags).toEqual(legacy.data.trackTags);
    expect(parseBackup(JSON.stringify(migrated)).data.tracks).toEqual(migrated.data.tracks);
  });

  it("rejects unknown formats", () => {
    expect(() => parseBackup('{"version":99}')).toThrow(/compatible/i);
  });
});
