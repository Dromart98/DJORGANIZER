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

  it("rejects unknown formats", () => {
    expect(() => parseBackup('{"version":99}')).toThrow(/compatible/i);
  });
});
