import { describe, expect, it } from "vitest";
import {
  fingerprintBatchSchema,
  importBatchSchema,
  importTrackSchema,
  importValidationMessage,
  type ImportTrackInput,
} from "@/lib/import/import-schema";

const validTrack: ImportTrackInput = {
  album: null,
  artist: "Nova",
  bpm: 126,
  client_id: "67cefe9c-4b34-44ca-b884-30c3f93607fa",
  duration_seconds: 240,
  file_fingerprint:
    "f6a8b3c23a7f0dfe4b9a0e96b0a6515f162c0f77c643fcf1f1f86a892f4f7c22",
  file_name: "pulse.mp3",
  file_size: 2048,
  file_type: "audio/mpeg",
  genre: "House",
  musical_key: "Am",
  release_year: 2024,
  title: "Pulse",
};

describe("importTrackSchema", () => {
  it("accepts serializable metadata without an audio payload", () => {
    expect(importTrackSchema.parse(validTrack)).toEqual(validTrack);
  });

  it("rejects invalid tag values", () => {
    expect(
      importValidationMessage({ ...validTrack, bpm: 500 }),
    ).toBeTruthy();
  });

  it("rejects unexpected payload fields", () => {
    expect(
      importTrackSchema.safeParse({ ...validTrack, audio: "bytes" }).success,
    ).toBe(false);
  });

  it("rejects malformed SHA-256 fingerprints", () => {
    expect(
      importTrackSchema.safeParse({
        ...validTrack,
        file_fingerprint: "not-a-fingerprint",
      }).success,
    ).toBe(false);
  });
});

describe("importBatchSchema", () => {
  it("limits each database request to 25 tracks", () => {
    expect(importBatchSchema.safeParse(Array(26).fill(validTrack)).success).toBe(
      false,
    );
  });
});

describe("fingerprintBatchSchema", () => {
  it("deduplicates fingerprints before querying the library", () => {
    const fingerprint = validTrack.file_fingerprint;
    expect(fingerprintBatchSchema.parse([fingerprint, fingerprint])).toEqual([
      fingerprint,
    ]);
  });
});
