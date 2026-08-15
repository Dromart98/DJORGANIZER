import { describe, expect, it } from "vitest";
import {
  createOrganizationPreview,
  countMissingSubgenreTracks,
  createOrganizationTree,
  filterScannedTracks,
  normalizeMissingSubgenreFolder,
  ORGANIZATION_TREE_PREVIEW_PATH_LIMIT,
  normalizeOrganizationRuleLevels,
  organizationRulesUseBpmRanges,
  organizationRulesUseLinkedMetadata,
  paginateScannedTracks,
  parseBpmRangeBoundaries,
  safePathSegment,
  type LinkedOrganizationMetadata,
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

const linkedMetadata = new Map<string, LinkedOrganizationMetadata>([
  [
    "track-1",
    {
      camelotKey: "8A",
      energy: 7,
      releaseYear: 2024,
      subgenre: "Deep House",
    },
  ],
]);

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

  it("supports configurable genre/subgenre handling without inventing metadata", () => {
    const withSubgenre = new Map<string, LinkedOrganizationMetadata>([
      ["track-1", { camelotKey: null, energy: null, releaseYear: null, subgenre: "Deep House" }],
    ]);
    expect(
      createOrganizationPreview([tracks[0]], "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreFolder: "Sin clasificar",
        missingSubgenreMode: "folder",
      })[0].targetPath,
    ).toBe("House/Deep House/Opening.mp3");
    expect(
      createOrganizationPreview([tracks[1]], "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreFolder: "Sin clasificar",
        missingSubgenreMode: "folder",
      })[0].targetPath,
    ).toBe("Género desconocido/Sin clasificar/Closing.flac");
    expect(
      createOrganizationPreview(tracks, "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreMode: "exclude",
      }),
    ).toHaveLength(1);
    expect(countMissingSubgenreTracks(tracks, withSubgenre)).toBe(1);
    expect(normalizeMissingSubgenreFolder("  Pendientes  ")).toBe("Pendientes");
    expect(normalizeMissingSubgenreFolder("   ")).toBeNull();
  });

  it("supports existing fixed schemes", () => {
    const genrePreview = createOrganizationPreview([tracks[0]], "genre")[0];
    expect(genrePreview.targetPath).toBe("House/Opening.mp3");
    expect(genrePreview.collisionResolved).toBe(false);
    expect(createOrganizationPreview([tracks[1]], "genre")[0].targetPath).toBe(
      "Género desconocido/Closing.flac",
    );
    expect(createOrganizationPreview([tracks[0]], "genre-artist")[0].targetPath)
      .toBe("House/DJ Aurora/Opening.mp3");
    expect(createOrganizationPreview([tracks[0]], "key-bpm")[0].targetPath)
      .toBe("Am/124 BPM/Opening.mp3");
  });

  it("validates configurable BPM boundaries", () => {
    expect(parseBpmRangeBoundaries("100, 120; 140")).toEqual([100, 120, 140]);
    expect(parseBpmRangeBoundaries("20, 300")).toEqual([20, 300]);
    expect(parseBpmRangeBoundaries("")).toBeNull();
    expect(parseBpmRangeBoundaries("100, 100")).toBeNull();
    expect(parseBpmRangeBoundaries("120, 100")).toBeNull();
    expect(parseBpmRangeBoundaries("19, 120")).toBeNull();
    expect(parseBpmRangeBoundaries("100, 301")).toBeNull();
    expect(parseBpmRangeBoundaries("100.5, 120")).toBeNull();
    expect(
      parseBpmRangeBoundaries("20 40 60 80 100 120 140 160 180"),
    ).toBeNull();
  });

  it("organizes by reviewed BPM ranges and preserves missing BPM", () => {
    const boundaries = [100, 120, 140];
    expect(
      createOrganizationPreview([tracks[0]], "bpm-range", {
        bpmBoundaries: boundaries,
      })[0].targetPath,
    ).toBe("120–139 BPM/Opening.mp3");
    expect(
      createOrganizationPreview([tracks[1]], "bpm-range", {
        bpmBoundaries: boundaries,
      })[0].targetPath,
    ).toBe("BPM desconocido/Closing.flac");
    expect(
      createOrganizationPreview([{ ...tracks[0], bpm: 99.6 }], "bpm-range", {
        bpmBoundaries: boundaries,
      })[0].targetPath,
    ).toBe("100–119 BPM/Opening.mp3");
  });

  it("combines BPM ranges with genre, key and linked library energy", () => {
    const options = {
      bpmBoundaries: [100, 120, 140],
      energyByScanId: new Map([["track-1", 7]]),
    };
    expect(
      createOrganizationPreview([tracks[0]], "genre-bpm-range", options)[0]
        .targetPath,
    ).toBe("House/120–139 BPM/Opening.mp3");
    expect(
      createOrganizationPreview([tracks[0]], "key-bpm-range", options)[0]
        .targetPath,
    ).toBe("Am/120–139 BPM/Opening.mp3");
    expect(
      createOrganizationPreview([tracks[0]], "energy-bpm-range", options)[0]
        .targetPath,
    ).toBe("Energía 7/120–139 BPM/Opening.mp3");
  });

  it("does not produce range previews until valid boundaries are reviewed", () => {
    expect(createOrganizationPreview(tracks, "bpm-range")).toEqual([]);
    expect(
      createOrganizationPreview(tracks, "bpm-range", {
        bpmBoundaries: [120, 100],
      }),
    ).toEqual([]);
  });
});

describe("organization rule builder", () => {
  it("accepts one to three contiguous unique levels", () => {
    expect(normalizeOrganizationRuleLevels(["genre"])).toEqual(["genre"]);
    expect(normalizeOrganizationRuleLevels(["genre", "artist", "album"]))
      .toEqual(["genre", "artist", "album"]);
    expect(normalizeOrganizationRuleLevels(["genre", "", ""])).toEqual([
      "genre",
    ]);
    expect(normalizeOrganizationRuleLevels([])).toBeNull();
    expect(normalizeOrganizationRuleLevels(["", "artist"])).toBeNull();
    expect(normalizeOrganizationRuleLevels(["genre", "", "album"]))
      .toBeNull();
    expect(normalizeOrganizationRuleLevels(["genre", "genre"])).toBeNull();
    expect(
      normalizeOrganizationRuleLevels(["genre", "artist", "album", "key"]),
    ).toBeNull();
  });

  it("identifies rule dependencies before native simulation", () => {
    expect(organizationRulesUseBpmRanges(["genre", "bpm-range"])).toBe(true);
    expect(organizationRulesUseBpmRanges(["genre", "bpm"])).toBe(false);
    expect(organizationRulesUseLinkedMetadata(["genre", "artist"])).toBe(false);
    expect(organizationRulesUseLinkedMetadata(["subgenre"])).toBe(true);
    expect(organizationRulesUseLinkedMetadata(["camelot"])).toBe(true);
    expect(organizationRulesUseLinkedMetadata(["energy"])).toBe(true);
    expect(organizationRulesUseLinkedMetadata(["year"])).toBe(true);
  });

  it("builds one to three levels from file and linked metadata", () => {
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        ruleLevels: ["genre", "artist", "album"],
      })[0].targetPath,
    ).toBe("House/DJ Aurora/Sin álbum/Opening.mp3");

    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        linkedMetadataByScanId: linkedMetadata,
        ruleLevels: ["subgenre", "camelot", "year"],
      })[0].targetPath,
    ).toBe("Deep House/8A/2024/Opening.mp3");

    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        linkedMetadataByScanId: linkedMetadata,
        ruleLevels: ["energy", "bpm"],
      })[0].targetPath,
    ).toBe("Energía 7/124 BPM/Opening.mp3");
  });

  it("uses neutral folders rather than inventing missing linked metadata", () => {
    expect(
      createOrganizationPreview([tracks[1]], "rules", {
        ruleLevels: ["subgenre", "camelot", "year"],
      })[0].targetPath,
    ).toBe(
      "Subgénero desconocido/Camelot desconocido/Año desconocido/Closing.flac",
    );
  });

  it("requires valid reviewed BPM cuts when the rule uses a BPM range", () => {
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        ruleLevels: ["genre", "bpm-range"],
      }),
    ).toEqual([]);
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        bpmBoundaries: [100, 120, 140],
        ruleLevels: ["genre", "bpm-range"],
      })[0].targetPath,
    ).toBe("House/120–139 BPM/Opening.mp3");
  });

  it("returns no preview for invalid rule combinations", () => {
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        ruleLevels: [],
      }),
    ).toEqual([]);
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        ruleLevels: ["genre", "genre"],
      }),
    ).toEqual([]);
    expect(
      createOrganizationPreview([tracks[0]], "rules", {
        ruleLevels: ["genre", "", "album"],
      }),
    ).toEqual([]);
  });

  it("builds a hierarchical folder tree from the preview", () => {
    const preview = createOrganizationPreview(
      [tracks[0], { ...tracks[0], scanId: "track-3", artist: "DJ Boreal" }],
      "rules",
      { ruleLevels: ["genre", "artist"] },
    );
    expect(createOrganizationTree(preview)).toEqual([
      {
        name: "House",
        children: [
          { name: "DJ Aurora", children: [] },
          { name: "DJ Boreal", children: [] },
        ],
      },
    ]);
  });

  it("bounds the rendered tree preview for large high-cardinality selections", () => {
    const preview = Array.from(
      { length: ORGANIZATION_TREE_PREVIEW_PATH_LIMIT + 50 },
      (_, index) => ({
        collisionResolved: false,
        sourcePath: `source-${index}.mp3`,
        targetPath: `Artist ${index}/Album ${index}/Track ${index}.mp3`,
      }),
    );
    const tree = createOrganizationTree(preview);
    const countNodes = (nodes: ReturnType<typeof createOrganizationTree>): number =>
      nodes.reduce(
        (total, node) => total + 1 + countNodes(node.children),
        0,
      );

    expect(tree).toHaveLength(ORGANIZATION_TREE_PREVIEW_PATH_LIMIT);
    expect(countNodes(tree)).toBe(ORGANIZATION_TREE_PREVIEW_PATH_LIMIT * 2);
  });
});
