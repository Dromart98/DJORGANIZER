import { z } from "zod";
import {
  DEFAULT_GENRE_TAXONOMY,
  GENRE_TAXONOMY_VERSION,
  type DefaultGenre,
} from "./genre-taxonomy";

export const GENRE_VALIDATION_MANIFEST_VERSION = "djorganizer-genre-manifest-v1";
export const GENRE_VALIDATION_EXECUTION_VERSION = "djorganizer-genre-execution-v1";

const genreSchema = z.enum(DEFAULT_GENRE_TAXONOMY);
const privateSafeText = (maximum: number) => z.string().trim().max(maximum).refine(
  (value) => !/(?:file:|[a-zA-Z]:[\\/]|(?:^|\s)\/)/.test(value),
  "El texto no puede contener rutas locales.",
);
const opaqueIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{2,80}$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeFileReferenceSchema = z.string().min(1).max(500).superRefine((value, ctx) => {
  if (/^(?:\/|\\|[a-zA-Z]:[\\/]|file:)/i.test(value) || value.includes("\\")) {
    ctx.addIssue({ code: "custom", message: "La referencia debe ser relativa y portable." });
  }
  if (value.split("/").includes("..")) {
    ctx.addIssue({ code: "custom", message: "La referencia no puede salir del banco local." });
  }
});

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;
const expectedGenresSchema = z.array(genreSchema).min(1).superRefine((values, ctx) => {
  if (!unique(values)) ctx.addIssue({ code: "custom", message: "Los géneros deben ser únicos." });
});

export const genreValidationSampleSchema = z.object({
  annotation: privateSafeText(1000).optional(),
  durationSeconds: z.number().finite().nonnegative().nullable(),
  expectedGenres: expectedGenresSchema,
  file: relativeFileReferenceSchema,
  id: opaqueIdSchema,
  manualReview: z.enum(["approved", "needs-review"]),
  sha256: sha256Schema,
}).strict();

export const genreValidationManifestSchema = z.object({
  bankId: opaqueIdSchema,
  formatVersion: z.literal(GENRE_VALIDATION_MANIFEST_VERSION),
  samples: z.array(genreValidationSampleSchema),
  taxonomyVersion: z.literal(GENRE_TAXONOMY_VERSION),
}).strict().superRefine((manifest, ctx) => {
  const ids = manifest.samples.map((sample) => sample.id);
  if (!unique(ids)) ctx.addIssue({ code: "custom", message: "Los identificadores de muestra deben ser únicos.", path: ["samples"] });
});

export const genrePredictionSchema = z.object({
  confidence: z.number().finite().min(0).max(1),
  genre: genreSchema,
}).strict();

const successfulResultSchema = z.object({
  costUsd: z.number().finite().nonnegative().optional(),
  explanation: privateSafeText(500).optional(),
  latencyMs: z.number().finite().nonnegative(),
  maxMemoryBytes: z.number().int().nonnegative().optional(),
  predictions: z.array(genrePredictionSchema),
  sampleId: opaqueIdSchema,
  status: z.literal("success"),
}).strict().superRefine((result, ctx) => {
  if (!unique(result.predictions.map((prediction) => prediction.genre))) {
    ctx.addIssue({ code: "custom", message: "Las predicciones no pueden repetir género.", path: ["predictions"] });
  }
});
const skippedResultSchema = z.object({ sampleId: opaqueIdSchema, status: z.literal("skipped") }).strict();
const errorResultSchema = z.object({
  errorCode: z.enum(["input_invalid", "provider_unavailable", "timeout", "unsupported", "unknown"]),
  sampleId: opaqueIdSchema,
  status: z.literal("error"),
}).strict();
export const genreValidationResultSchema = z.discriminatedUnion("status", [successfulResultSchema, skippedResultSchema, errorResultSchema]);

export const genreValidationExecutionSchema = z.object({
  configuration: z.record(z.string().max(100), privateSafeText(500)).default({}),
  executionId: opaqueIdSchema,
  executedAt: z.iso.datetime(),
  formatVersion: z.literal(GENRE_VALIDATION_EXECUTION_VERSION),
  model: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(100),
  providerVersion: z.string().trim().min(1).max(200),
  results: z.array(genreValidationResultSchema),
  taxonomyVersion: z.literal(GENRE_TAXONOMY_VERSION),
}).strict().superRefine((execution, ctx) => {
  for (const key of Object.keys(execution.configuration)) {
    if (/(?:api[_-]?key|token|secret|password)/i.test(key)) {
      ctx.addIssue({ code: "custom", message: "La configuración no puede contener secretos.", path: ["configuration", key] });
    }
  }
  if (!unique(execution.results.map((result) => result.sampleId))) {
    ctx.addIssue({ code: "custom", message: "Los resultados no pueden repetir muestra.", path: ["results"] });
  }
});

export type GenreValidationManifest = z.infer<typeof genreValidationManifestSchema>;
export type GenreValidationExecution = z.infer<typeof genreValidationExecutionSchema>;

export function validateGenreValidationExecution(manifest: GenreValidationManifest, input: unknown): GenreValidationExecution {
  const execution = genreValidationExecutionSchema.parse(input);
  const sampleIds = new Set(manifest.samples.map((sample) => sample.id));
  if (execution.results.some((result) => !sampleIds.has(result.sampleId))) {
    throw new Error("La ejecución contiene una muestra que no existe en el manifiesto.");
  }
  return execution;
}

export type GenreEvaluationConfiguration = { confidenceThreshold?: number; maxLabelsPerSample?: number };
type LabelCounts = { falseNegatives: number; falsePositives: number; truePositives: number; support: number };
type LabelMetrics = LabelCounts & { f1: number; precision: number; recall: number };
export type GenreEvaluation = {
  coverage: number; exactSetAccuracy: number; firstPredictionAccuracy: number; macroF1: number; macroPrecision: number; macroRecall: number;
  microF1: number; microPrecision: number; microRecall: number; samplesCorrect: number; samplesErrored: number; samplesOmitted: number;
  samplesScored: number; samplesTotal: number; performance: { averageCostUsd: number | null; averageLatencyMs: number | null; maxMemoryBytes: number | null; p50LatencyMs: number | null; p95LatencyMs: number | null; totalCostUsd: number | null };
  perGenre: Record<DefaultGenre, LabelMetrics>;
};
const round = (value: number) => Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : 0;
const ratio = (numerator: number, denominator: number) => denominator === 0 ? 0 : round(numerator / denominator);
const f1 = (precision: number, recall: number) => ratio(2 * precision * recall, precision + recall);
const percentile = (values: readonly number[], percentileValue: number) => values.length === 0 ? null : values[Math.ceil(values.length * percentileValue) - 1] ?? null;

/** Evaluates only successful results; skipped, errored, and absent results lower coverage but do not create label guesses. */
export function evaluateGenreValidation(manifest: GenreValidationManifest, execution: GenreValidationExecution, configuration: GenreEvaluationConfiguration = {}): GenreEvaluation {
  const threshold = configuration.confidenceThreshold ?? 0;
  const topK = configuration.maxLabelsPerSample ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("El umbral debe estar entre 0 y 1.");
  if (!Number.isInteger(topK) || topK < 0) throw new Error("El máximo de etiquetas debe ser un entero no negativo.");
  const results = new Map(execution.results.map((result) => [result.sampleId, result]));
  const counts = Object.fromEntries(DEFAULT_GENRE_TAXONOMY.map((genre) => [genre, { falseNegatives: 0, falsePositives: 0, support: 0, truePositives: 0 }])) as Record<DefaultGenre, LabelCounts>;
  let errored = 0, omitted = 0, scored = 0, correct = 0, firstCorrect = 0;
  const latencies: number[] = [], memories: number[] = [], costs: number[] = [];
  for (const sample of manifest.samples) {
    const result = results.get(sample.id);
    if (!result || result.status === "skipped") { omitted++; continue; }
    if (result.status === "error") { errored++; continue; }
    scored++;
    latencies.push(result.latencyMs);
    if (result.maxMemoryBytes !== undefined) memories.push(result.maxMemoryBytes);
    if (result.costUsd !== undefined) costs.push(result.costUsd);
    const expected = new Set(sample.expectedGenres);
    const selectedPredictions = result.predictions
      .filter((prediction) => prediction.confidence >= threshold)
      .slice(0, topK);
    const predicted = new Set(selectedPredictions.map((prediction) => prediction.genre));
    if (selectedPredictions[0] && expected.has(selectedPredictions[0].genre)) firstCorrect++;
    if (expected.size === predicted.size && [...expected].every((genre) => predicted.has(genre))) correct++;
    for (const genre of DEFAULT_GENRE_TAXONOMY) {
      const actual = expected.has(genre), guessed = predicted.has(genre), count = counts[genre];
      if (actual) count.support++;
      if (actual && guessed) count.truePositives++;
      else if (guessed) count.falsePositives++;
      else if (actual) count.falseNegatives++;
    }
  }
  const perGenre = Object.fromEntries(DEFAULT_GENRE_TAXONOMY.map((genre) => {
    const count = counts[genre]; const precision = ratio(count.truePositives, count.truePositives + count.falsePositives); const recall = ratio(count.truePositives, count.truePositives + count.falseNegatives);
    return [genre, { ...count, f1: f1(precision, recall), precision, recall }];
  })) as Record<DefaultGenre, LabelMetrics>;
  const active = DEFAULT_GENRE_TAXONOMY.filter((genre) => perGenre[genre].support > 0 || perGenre[genre].falsePositives > 0);
  const total = DEFAULT_GENRE_TAXONOMY.reduce((sum, genre) => ({ falseNegatives: sum.falseNegatives + perGenre[genre].falseNegatives, falsePositives: sum.falsePositives + perGenre[genre].falsePositives, truePositives: sum.truePositives + perGenre[genre].truePositives }), { falseNegatives: 0, falsePositives: 0, truePositives: 0 });
  const microPrecision = ratio(total.truePositives, total.truePositives + total.falsePositives), microRecall = ratio(total.truePositives, total.truePositives + total.falseNegatives);
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  return { coverage: ratio(scored, manifest.samples.length), exactSetAccuracy: ratio(correct, scored), firstPredictionAccuracy: ratio(firstCorrect, scored), macroF1: ratio(active.reduce((sum, genre) => sum + perGenre[genre].f1, 0), active.length), macroPrecision: ratio(active.reduce((sum, genre) => sum + perGenre[genre].precision, 0), active.length), macroRecall: ratio(active.reduce((sum, genre) => sum + perGenre[genre].recall, 0), active.length), microF1: f1(microPrecision, microRecall), microPrecision, microRecall, samplesCorrect: correct, samplesErrored: errored, samplesOmitted: omitted, samplesScored: scored, samplesTotal: manifest.samples.length, performance: { averageCostUsd: costs.length ? round(costs.reduce((sum, value) => sum + value, 0) / costs.length) : null, averageLatencyMs: latencies.length ? round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null, maxMemoryBytes: memories.length ? Math.max(...memories) : null, p50LatencyMs: percentile(sortedLatencies, .5), p95LatencyMs: percentile(sortedLatencies, .95), totalCostUsd: costs.length ? round(costs.reduce((sum, value) => sum + value, 0)) : null }, perGenre };
}
