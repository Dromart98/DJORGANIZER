import { describe, expect, it } from "vitest";
import {
  createOrganizationPreview,
  filterScannedTracks,
  paginateScannedTracks,
  safePathSegment,
  type ScannedAudioFile,
} from "./scan-review";

const tracks: ScannedAudioFile[] = [
  {
    scanId: "track-1",
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
    scanId: "track-2",
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

  it("keeps the rendered window bounded with 50,000 scanned tracks", () => {
    const largeLibrary = Array.from({ length: 50_000 }, (_, index) => ({
      ...tracks[0],
      name: `Track ${index}.mp3`,
      relativePath: `Library/${index}/Track ${index}.mp3`,
      scanId: `track-${index}`,
      title: `Track ${index}`,
    }));
    const filtered = filterScannedTracks(largeLibrary, "track 49999", "all");
    const page = paginateScannedTracks(largeLibrary, 1_500, 25);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].scanId).toBe("track-49999");
    expect(page.items).toHaveLength(25);
    expect(page.total).toBe(50_000);
    expect(page.totalPages).toBe(2_000);
  });
});


describe("desktop organization preview", () => {
  it("sanitizes traversal, reserved names and filesystem punctuation", () => {
    expect(safePathSegment("../CON", "Fallback")).toBe("_CON");
    expect(safePathSegment('Artist: Live/Set?', "Fallback")).toBe(
      "Artist Live Set",
    );
    expect(safePathSegment(`${"a".repeat(79)}.trailing`, "Fallback")).toBe(
      "a".repeat(79),
    );
  });

  it("builds deterministic paths and resolves case-insensitive collisions", () => {
    const preview = createOrganizationPreview(
      [
        tracks[0],
        {
          ...tracks[0],
          name: "Other.mp3",
          relativePath: "Other.mp3",
        },
      ],
      "artist-album",
    );

    expect(preview).toEqual([
      {
        sourcePath: "Other.mp3",
        targetPath: "DJ Aurora/Sin álbum/Opening.mp3",
        collisionResolved: false,
      },
      {
        sourcePath: "Set/Opening.mp3",
        targetPath: "DJ Aurora/Sin álbum/Opening (2).mp3",
        collisionResolved: true,
      },
    ]);
  });

  it("supports genre and harmonic organization schemes", () => {
    expect(createOrganizationPreview([tracks[0]], "genre-artist")[0].targetPath)
      .toBe("House/DJ Aurora/Opening.mp3");
    expect(createOrganizationPreview([tracks[0]], "key-bpm")[0].targetPath)
      .toBe("Am/124 BPM/Opening.mp3");
  });
});
