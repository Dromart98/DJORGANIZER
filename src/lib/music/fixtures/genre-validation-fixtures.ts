import {
  GENRE_VALIDATION_EXECUTION_VERSION,
  GENRE_VALIDATION_MANIFEST_VERSION,
} from "../genre-validation";
import { GENRE_TAXONOMY_VERSION } from "../genre-taxonomy";

/** Synthetic metadata only. The referenced WAV files intentionally do not exist. */
export const genreValidationFixtureManifest = {
  bankId: "fixture-bank",
  formatVersion: GENRE_VALIDATION_MANIFEST_VERSION,
  taxonomyVersion: GENRE_TAXONOMY_VERSION,
  samples: [
    { id: "sample-techno", file: "samples/sample-techno.wav", sha256: "a".repeat(64), durationSeconds: 30, expectedGenres: ["Techno"], manualReview: "approved" },
    { id: "sample-house", file: "samples/sample-house.wav", sha256: "b".repeat(64), durationSeconds: 30, expectedGenres: ["House"], manualReview: "approved" },
    { id: "sample-ambiguous", file: "samples/sample-ambiguous.wav", sha256: "c".repeat(64), durationSeconds: null, expectedGenres: ["Deep House", "House"], manualReview: "needs-review", annotation: "Synthetic ambiguous-label fixture." },
  ],
} as const;

export const genreValidationFixtureExecution = {
  configuration: { synthetic: "true" }, executionId: "fixture-run", executedAt: "2026-07-22T00:00:00.000Z", formatVersion: GENRE_VALIDATION_EXECUTION_VERSION,
  model: "fixture-model", provider: "fixture-provider", providerVersion: "1", taxonomyVersion: GENRE_TAXONOMY_VERSION,
  results: [
    { sampleId: "sample-techno", status: "success", predictions: [{ genre: "Techno", confidence: 0.9 }], latencyMs: 10, maxMemoryBytes: 100, costUsd: 0.01 },
    { sampleId: "sample-house", status: "success", predictions: [{ genre: "House", confidence: 0.8 }], latencyMs: 20, maxMemoryBytes: 200, costUsd: 0.02 },
    { sampleId: "sample-ambiguous", status: "success", predictions: [{ genre: "Deep House", confidence: 0.7 }], latencyMs: 30 },
  ],
} as const;
