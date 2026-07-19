import { describe, expect, it } from "vitest";
import {
  acousticSimilarity,
  createAcousticSignature,
  detectVersionRelationship,
  inferVersionType,
} from "./acoustic-similarity";

function signal(amplitude: number, frequency = 30) {
  const sampleRate = 1_024;
  const samples = Float32Array.from(
    { length: sampleRate * 4 },
    (_, index) =>
      amplitude *
      (0.4 + index / samplesLength) *
      Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
  return createAcousticSignature(samples, sampleRate);
}

const samplesLength = 1_024 * 4;

describe("acoustic similarity", () => {
  it("is resilient to gain changes", () => {
    expect(acousticSimilarity(signal(0.2), signal(0.8))).toBeGreaterThan(0.98);
  });

  it("separates different temporal/frequency profiles", () => {
    expect(acousticSimilarity(signal(0.8, 30), signal(0.8, 170))).toBeLessThan(
      0.9,
    );
  });

  it("recognizes remixes sharing a base title", () => {
    expect(
      detectVersionRelationship(
        { bpm: 124, durationSeconds: 220, title: "Orbit (Original Mix)" },
        { bpm: 126, durationSeconds: 250, title: "Orbit - Club Remix" },
        0.72,
      ),
    ).toBe("version-or-remix");
  });

  it("recognizes explicit version labels", () => {
    expect(inferVersionType("Orbit (Lunar Remix)")).toBe("remix");
    expect(inferVersionType("Orbit - Radio Edit")).toBe("edit");
    expect(inferVersionType("Orbit (2026 Remastered)")).toBe("remaster");
  });
});
