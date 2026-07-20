import { describe, expect, it } from "vitest";
import { resolveLinkedScanIds } from "./export-request";

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
});
