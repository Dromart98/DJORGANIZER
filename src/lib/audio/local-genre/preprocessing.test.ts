import { describe, expect, it } from "vitest";
import {
  createFixedBatches,
  createMelFilterBank,
  createPatches,
  computeMusiCnnFrames,
  FIXED_BATCH_SIZE,
  MEL_BANDS,
  PATCH_FRAMES,
} from "./preprocessing";

describe("Discogs-EffNet preprocessing", () => {
  it("builds the confirmed 96 by 257 Slaney filter bank", () => {
    const filters = createMelFilterBank();
    expect(filters).toHaveLength(96);
    expect(filters.every((filter) => filter.length === 257)).toBe(true);
    expect(filters.flatMap((filter) => Array.from(filter)).every(Number.isFinite)).toBe(true);
  });

  it("maps silence to zero log-mel features", () => {
    const { features, frameCount } = computeMusiCnnFrames(
      new Float32Array(32_768),
    );
    expect(frameCount).toBe(128);
    expect(features).toHaveLength(128 * MEL_BANDS);
    expect(features.every((value) => value === 0)).toBe(true);
  });

  it("creates 128-frame patches with a 62-frame hop", () => {
    const frameCount = 252;
    const features = Float32Array.from(
      { length: frameCount * MEL_BANDS },
      (_, index) => index,
    );
    const { patches, patchCount } = createPatches(features, frameCount);
    expect(patchCount).toBe(3);
    expect(patches).toHaveLength(3 * PATCH_FRAMES * MEL_BANDS);
    expect(patches[PATCH_FRAMES * MEL_BANDS]).toBe(features[62 * MEL_BANDS]);
  });

  it("pads only the fixed batch tail with zeros", () => {
    const patchSize = PATCH_FRAMES * MEL_BANDS;
    const patches = new Float32Array(65 * patchSize).fill(1);
    const batches = createFixedBatches(patches, 65);
    expect(batches).toHaveLength(2);
    expect(batches[0].actualPatches).toBe(FIXED_BATCH_SIZE);
    expect(batches[1].actualPatches).toBe(1);
    expect(batches[1].values[0]).toBe(1);
    expect(batches[1].values[patchSize]).toBe(0);
  });

  it("rejects audio too short for one official patch", () => {
    expect(() => createPatches(new Float32Array(127 * MEL_BANDS), 127)).toThrow(
      /demasiado corto/,
    );
  });
});
