import { describe, expect, it } from "vitest";
import {
  buildMetadataCleanupProposals,
  proposeMetadataCleanup,
} from "./metadata-cleanup";

describe("proposeMetadataCleanup", () => {
  it("collapses whitespace without deleting meaningful text", () => {
    expect(proposeMetadataCleanup("artist", "  DJ\u00a0Aurora   Live  ")).toEqual({
      proposedValue: "DJ Aurora Live",
      reasons: ["whitespace"],
    });
  });

  it("removes residual URLs but never proposes an empty value", () => {
    expect(
      proposeMetadataCleanup("title", "Opening https://example.com/promo"),
    ).toEqual({ proposedValue: "Opening", reasons: ["url"] });
    expect(proposeMetadataCleanup("artist", "https://example.com")).toBeNull();
  });

  it("removes short numeric track prefixes without treating years as prefixes", () => {
    expect(proposeMetadataCleanup("title", "01 - opening track")).toEqual({
      proposedValue: "Opening Track",
      reasons: ["track-number", "case"],
    });
    expect(proposeMetadataCleanup("title", "2024")).toBeNull();
    expect(proposeMetadataCleanup("title", "2024 - Summer Mix")).toBeNull();
  });

  it("normalizes separator spacing without rewriting compact artist names", () => {
    expect(proposeMetadataCleanup("artist", "DJ A  &  DJ B")).toEqual({
      proposedValue: "DJ A & DJ B",
      reasons: ["whitespace"],
    });
    expect(proposeMetadataCleanup("artist", "AC/DC")).toBeNull();
  });

  it("normalizes uniform casing but preserves intentional mixed case", () => {
    expect(proposeMetadataCleanup("artist", "dj aurora")).toEqual({
      proposedValue: "DJ Aurora",
      reasons: ["case"],
    });
    expect(proposeMetadataCleanup("album", "NIGHT DRIVE")).toEqual({
      proposedValue: "Night Drive",
      reasons: ["case"],
    });
    expect(proposeMetadataCleanup("artist", "deadmau5")).toEqual({
      proposedValue: "Deadmau5",
      reasons: ["case"],
    });
    expect(proposeMetadataCleanup("artist", "Daft Punk")).toBeNull();
  });

  it("canonicalizes only known genre aliases", () => {
    expect(proposeMetadataCleanup("genre", "dnb")).toEqual({
      proposedValue: "Drum & Bass",
      reasons: ["genre-alias"],
    });
    expect(proposeMetadataCleanup("genre", "hip hop")).toEqual({
      proposedValue: "Hip-Hop",
      reasons: ["genre-alias"],
    });
    expect(proposeMetadataCleanup("genre", "rnb")).toEqual({
      proposedValue: "R&B",
      reasons: ["genre-alias"],
    });
  });
});

describe("buildMetadataCleanupProposals", () => {
  it("builds independent reviewable proposals and skips empty fields", () => {
    expect(
      buildMetadataCleanupProposals([
        {
          album: null,
          artist: "DJ A",
          genre: "tech house",
          id: "track-1",
          subgenre: null,
          title: "02 - PEAK TIME",
        },
      ]),
    ).toEqual([
      {
        currentValue: "02 - PEAK TIME",
        field: "title",
        proposedValue: "Peak Time",
        reasons: ["track-number", "case"],
        trackId: "track-1",
        trackTitle: "02 - PEAK TIME",
      },
      {
        currentValue: "tech house",
        field: "genre",
        proposedValue: "Tech House",
        reasons: ["genre-alias"],
        trackId: "track-1",
        trackTitle: "02 - PEAK TIME",
      },
    ]);
  });
});
