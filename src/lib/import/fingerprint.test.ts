import { describe, expect, it, vi } from "vitest";
import { fingerprintBlob } from "@/lib/import/fingerprint";

describe("fingerprintBlob", () => {
  it("calculates the SHA-256 fingerprint without loading a custom full buffer", async () => {
    const blob = new Blob(["hello"]);

    await expect(fingerprintBlob(blob)).resolves.toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("reports bounded progress and always finishes at 100 percent", async () => {
    const onProgress = vi.fn();

    await fingerprintBlob(new Blob(["progress"]), onProgress);

    expect(onProgress).toHaveBeenCalledWith(0);
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(
      onProgress.mock.calls.every(
        ([percentage]) => percentage >= 0 && percentage <= 100,
      ),
    ).toBe(true);
  });
});
