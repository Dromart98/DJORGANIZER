import { describe, expect, it } from "vitest";
import { isDesktopExportRequest, resolveLinkedScanIds } from "./export-request";

describe("resolveLinkedScanIds", () => {
  it("keeps the requested crate order and omits tracks without a local link", () => {
    expect(
      resolveLinkedScanIds(
        { trackIds: ["track-b", "track-a", "missing"] },
        [
          { scanId: "scan-a", trackId: "track-a" },
          { scanId: "scan-b", trackId: "track-b" },
        ],
      ),
    ).toEqual({ omitted: 1, scanIds: ["scan-b", "scan-a"] });
  });

  it("keeps library selection order, including an empty selection", () => {
    expect(resolveLinkedScanIds({ trackIds: [] }, [])).toEqual({
      omitted: 0,
      scanIds: [],
    });
    expect(
      resolveLinkedScanIds(
        { trackIds: ["track-a", "track-b"] },
        [
          { scanId: "scan-a", trackId: "track-a" },
          { scanId: "scan-b", trackId: "track-b" },
        ],
      ),
    ).toEqual({ omitted: 0, scanIds: ["scan-a", "scan-b"] });
  });

  it("deduplicates requested IDs without inventing local paths", () => {
    expect(
      resolveLinkedScanIds(
        { crateName: "Closing set", trackIds: ["track-a", "track-a", "missing"] },
        [{ scanId: "scan-a", trackId: "track-a" }],
      ),
    ).toEqual({ omitted: 1, scanIds: ["scan-a"] });
  });

  it("accepts only valid, path-free requests", () => {
    expect(isDesktopExportRequest({ crateName: "Set", trackIds: ["track-a"] })).toBe(true);
    expect(isDesktopExportRequest({ trackIds: ["track-a", 1] })).toBe(false);
    expect(isDesktopExportRequest({ trackIds: "track-a" })).toBe(false);
    expect(isDesktopExportRequest(null)).toBe(false);
  });
});
