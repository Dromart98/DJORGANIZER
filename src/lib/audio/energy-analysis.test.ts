import { describe, expect, it } from "vitest";
import { analyzeEnergySamples } from "./energy-analysis";

function sine(amplitude: number, seconds = 4, frequency = 220) {
  const sampleRate = 8_000;
  const samples = Float32Array.from(
    { length: sampleRate * seconds },
    (_, index) =>
      amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
  return { sampleRate, samples };
}

describe("analyzeEnergySamples", () => {
  it("scores louder material above quieter material", () => {
    const quiet = sine(0.04);
    const loud = sine(0.8);

    expect(
      analyzeEnergySamples(loud.samples, loud.sampleRate).energy,
    ).toBeGreaterThan(
      analyzeEnergySamples(quiet.samples, quiet.sampleRate).energy,
    );
  });

  it("returns bounded documented values", () => {
    const input = sine(0.5, 30);
    const result = analyzeEnergySamples(input.samples, input.sampleRate);

    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe(1);
    expect(result.rmsDb).toBeLessThan(0);
  });

  it("rejects empty audio", () => {
    expect(() => analyzeEnergySamples([], 44_100)).toThrow(/audio/i);
  });
});
