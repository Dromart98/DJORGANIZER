import { describe, expect, it, vi } from "vitest";
import { selectValidatedBackend, type BackendCandidate } from "./backend";

describe("local genre backend selection", () => {
  const candidates: BackendCandidate[] = [
    { available: () => true, name: "webgpu" },
    { available: () => true, name: "webgl" },
    { available: () => true, name: "wasm" },
    { available: () => true, name: "cpu" },
  ];

  it("uses the first backend that passes a real validation callback", async () => {
    const validate = vi.fn(async (name: BackendCandidate["name"]) => name === "wasm");
    await expect(selectValidatedBackend(candidates, validate)).resolves.toBe("wasm");
    expect(validate.mock.calls.map(([name]) => name)).toEqual([
      "webgpu",
      "webgl",
      "wasm",
    ]);
  });

  it("reports a browser with no usable backend", async () => {
    await expect(
      selectValidatedBackend(candidates, async () => false),
    ).rejects.toThrow(/backend compatible/);
  });
});
