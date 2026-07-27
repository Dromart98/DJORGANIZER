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

  it("migrates version 1 energy exactly once and preserves relations", () => {
    const legacy = {
      createdAt: "2026-07-19T12:00:00.000Z",
      product: "DJOrganizer",
      version: 1,
      data: {
        tracks: [{ id: "track", energy: 99 }],
        crates: [{ id: "crate" }],
        crateTracks: [{ crate_id: "crate", track_id: "track", position: 0 }],
        tags: [{ id: "tag" }],
        trackTags: [{ tag_id: "tag", track_id: "track" }],
      },
    };
    const migrated = parseBackup(JSON.stringify(legacy));
    expect(migrated.version).toBe(2);
    expect(migrated.data.tracks).toEqual([expect.objectContaining({ energy: 10, energy_source: "unknown" })]);
    expect(migrated.data.crateTracks).toEqual(legacy.data.crateTracks);
    expect(parseBackup(JSON.stringify(migrated)).data.tracks).toEqual(migrated.data.tracks);
  });

  it("rejects unknown formats", () => {
    expect(() => parseBackup('{"version":99}')).toThrow(/compatible/i);
  });
});
