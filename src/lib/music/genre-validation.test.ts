/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { genreValidationFixtureExecution, genreValidationFixtureManifest } from "./fixtures/genre-validation-fixtures";
import { evaluateGenreValidation, genreValidationExecutionSchema, genreValidationManifestSchema, validateGenreValidationExecution } from "./genre-validation";

const manifest = () => genreValidationManifestSchema.parse(genreValidationFixtureManifest);
const execution = () => validateGenreValidationExecution(manifest(), genreValidationFixtureExecution);

describe("genre validation contracts", () => {
  it("accepts single- and multi-label synthetic manifests", () => {
    expect(manifest().samples).toHaveLength(3);
    expect(manifest().samples[2]?.expectedGenres).toEqual(["Deep House", "House"]);
  });
  it.each([
    ["duplicate sample id", (value: any) => { value.samples[1].id = value.samples[0].id; }],
    ["unknown genre", (value: any) => { value.samples[0].expectedGenres = ["Invented"]; }],
    ["duplicate genres", (value: any) => { value.samples[0].expectedGenres = ["Techno", "Techno"]; }],
    ["empty genres", (value: any) => { value.samples[0].expectedGenres = []; }],
    ["invalid sha", (value: any) => { value.samples[0].sha256 = "abc"; }],
    ["unix path", (value: any) => { value.samples[0].file = "/private/audio.wav"; }],
    ["windows path", (value: any) => { value.samples[0].file = "C:\\audio.wav"; }],
    ["parent path", (value: any) => { value.samples[0].file = "samples/../audio.wav"; }],
    ["file URL", (value: any) => { value.samples[0].file = "file:///audio.wav"; }],
    ["taxonomy version", (value: any) => { value.taxonomyVersion = "other"; }],
  ])("rejects %s", (_, mutate) => {
    const value: any = structuredClone(genreValidationFixtureManifest); mutate(value); expect(genreValidationManifestSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    ["duplicate results", (value: any) => { value.results.push(structuredClone(value.results[0])); }],
    ["invalid confidence low", (value: any) => { value.results[0].predictions[0].confidence = -0.1; }],
    ["invalid confidence high", (value: any) => { value.results[0].predictions[0].confidence = 1.1; }],
    ["duplicate predictions", (value: any) => { value.results[0].predictions.push({ genre: "Techno", confidence: .4 }); }],
    ["unsanitized error", (value: any) => { value.results[0] = { sampleId: "sample-techno", status: "error", errorCode: "/private/token" }; }],
    ["long explanation", (value: any) => { value.results[0].explanation = "x".repeat(501); }],
    ["private explanation", (value: any) => { value.results[0].explanation = "file:///private/audio.wav"; }],
    ["secret configuration", (value: any) => { value.configuration.apiKey = "private"; }],
  ])("rejects %s in an execution", (_, mutate) => {
    const value: any = structuredClone(genreValidationFixtureExecution); mutate(value); expect(genreValidationExecutionSchema.safeParse(value).success).toBe(false);
  });
  it("rejects a result that does not map to a manifest sample", () => {
    const value: any = structuredClone(genreValidationFixtureExecution); value.results[0].sampleId = "missing-sample";
    expect(() => validateGenreValidationExecution(manifest(), value)).toThrow(/no existe/i);
  });
});

describe("evaluateGenreValidation", () => {
  it("calculates a perfect result and performance aggregates", () => {
    const value: any = structuredClone(genreValidationFixtureExecution);
    value.results[2].predictions.push({ genre: "House", confidence: .6 });
    const result = evaluateGenreValidation(manifest(), validateGenreValidationExecution(manifest(), value));
    expect(result).toMatchObject({ coverage: 1, exactSetAccuracy: 1, firstPredictionAccuracy: 1, microF1: 1, macroF1: 1, samplesCorrect: 3 });
    expect(result.performance).toEqual({ averageLatencyMs: 20, p50LatencyMs: 20, p95LatencyMs: 30, maxMemoryBytes: 200, totalCostUsd: .03, averageCostUsd: .015 });
  });
  it("scores incorrect, partial, and empty predictions without non-finite values", () => {
    const value: any = structuredClone(genreValidationFixtureExecution);
    value.results[0].predictions = [{ genre: "House", confidence: .9 }]; value.results[1].predictions = []; value.results[2].predictions = [{ genre: "Deep House", confidence: .9 }];
    const result = evaluateGenreValidation(manifest(), validateGenreValidationExecution(manifest(), value));
    expect(result.samplesCorrect).toBe(0); expect(result.perGenre.Techno.falseNegatives).toBe(1); expect(result.perGenre.House.falsePositives).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
  it("applies confidence threshold and top-k in provider order", () => {
    const value: any = structuredClone(genreValidationFixtureExecution);
    value.results[0].predictions = [{ genre: "House", confidence: .99 }, { genre: "Techno", confidence: .5 }];
    const run = validateGenreValidationExecution(manifest(), value);
    expect(evaluateGenreValidation(manifest(), run, { confidenceThreshold: .6 }).perGenre.Techno.falseNegatives).toBe(1);
    expect(evaluateGenreValidation(manifest(), run, { maxLabelsPerSample: 1 }).perGenre.Techno.falseNegatives).toBe(1);
  });
  it("counts errors and omissions as uncovered while excluding them from label quality", () => {
    const value: any = structuredClone(genreValidationFixtureExecution);
    value.results[1] = { sampleId: "sample-house", status: "error", errorCode: "timeout" }; value.results[2] = { sampleId: "sample-ambiguous", status: "skipped" };
    const result = evaluateGenreValidation(manifest(), validateGenreValidationExecution(manifest(), value));
    expect(result).toMatchObject({ samplesErrored: 1, samplesOmitted: 1, samplesScored: 1, coverage: .3333, exactSetAccuracy: 1 });
  });
  it("handles zero samples, absent memory/cost, and does not mutate inputs", () => {
    const empty = genreValidationManifestSchema.parse({ ...genreValidationFixtureManifest, samples: [] });
    const run = validateGenreValidationExecution(empty, { ...genreValidationFixtureExecution, results: [] });
    expect(evaluateGenreValidation(empty, run).performance).toEqual({ averageLatencyMs: null, p50LatencyMs: null, p95LatencyMs: null, maxMemoryBytes: null, totalCostUsd: null, averageCostUsd: null });
    const before = JSON.stringify([genreValidationFixtureManifest, genreValidationFixtureExecution]); evaluateGenreValidation(manifest(), execution()); expect(JSON.stringify([genreValidationFixtureManifest, genreValidationFixtureExecution])).toBe(before);
  });
});
