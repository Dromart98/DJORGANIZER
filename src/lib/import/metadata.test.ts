import { describe, expect, it } from "vitest";
import {
  metadataToImportTrack,
  titleFromFileName,
} from "@/lib/import/metadata";

describe("titleFromFileName", () => {
  it("uses the local file name without its final extension", () => {
    expect(titleFromFileName("Night.drive.final.mp3")).toBe(
      "Night.drive.final",
    );
  });
});

describe("metadataToImportTrack", () => {
  it("normalizes supported tags and file information", () => {
    expect(
      metadataToImportTrack(
        {
          common: {
            album: "  Club Tools ",
            artist: "  Nova ",
            bpm: 127.456,
            genre: ["House", "Electronic"],
            key: " Am ",
            title: "  Pulse ",
            year: 2025,
          },
          format: { duration: 242.9876 },
        },
        { name: "pulse.flac", size: 2048, type: "audio/flac" },
        "a8209c99-ccf2-4d8c-a245-97abcb45e761",
      ),
    ).toEqual({
      album: "Club Tools",
      artist: "Nova",
      bpm: 127.46,
      client_id: "a8209c99-ccf2-4d8c-a245-97abcb45e761",
      duration_seconds: 242.988,
      file_name: "pulse.flac",
      file_size: 2048,
      file_type: "audio/flac",
      genre: "House",
      musical_key: "Am",
      release_year: 2025,
      title: "Pulse",
    });
  });

  it("falls back to the filename and leaves missing artist for review", () => {
    const track = metadataToImportTrack(
      { common: {}, format: {} },
      { name: "Unknown Track.wav", size: 12, type: "" },
      "62ab6746-7c0d-4c88-b085-1cf6da1b909d",
    );

    expect(track.title).toBe("Unknown Track");
    expect(track.artist).toBe("");
    expect(track.file_type).toBe("application/octet-stream");
  });
});

