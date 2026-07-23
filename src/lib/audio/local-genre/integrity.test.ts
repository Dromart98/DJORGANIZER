import { describe, expect, it } from "vitest";
import { parseIntegrityManifest, sha256Hex, verifyBytes } from "./integrity";

describe("local model integrity", () => {
  it("reads a compatible manifest", () => {
    const file = { bytes: 5, sha256: "a".repeat(64) };
    expect(
      parseIntegrityManifest({
        files: { "metadata.json": file, "model.json": file },
        name: "discogs-effnet-bs64-1",
        schemaVersion: 1,
        version: "tfjs-v1",
      }).version,
    ).toBe("tfjs-v1");
  });

  it("rejects an incompatible or incomplete manifest", () => {
    expect(() => parseIntegrityManifest({ schemaVersion: 2 })).toThrow(
      /compatible/,
    );
  });

  it("accepts valid bytes and rejects corrupted bytes", async () => {
    const valid = new TextEncoder().encode("hello").buffer;
    const expected = { bytes: 5, sha256: await sha256Hex(valid) };
    await expect(verifyBytes(valid, expected)).resolves.toBe(true);
    await expect(
      verifyBytes(new TextEncoder().encode("jello").buffer, expected),
    ).resolves.toBe(false);
  });
});
