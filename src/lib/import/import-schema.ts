import { z } from "zod";

const MANUAL_ANALYSIS_EXPLANATION = "Valor revisado manualmente.";

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .transform((value: string | null) => value || null);

const nullableAnalysisExplanation = nullableText(500).transform((value) =>
  value === "Manually reviewed value."
    ? MANUAL_ANALYSIS_EXPLANATION
    : value,
);

const nullableNumber = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum).nullable();

export const importTrackSchema = z
  .object({
    acoustic_fingerprint: nullableText(5000),
    album: nullableText(300),
    artist: nullableText(300),
    bpm: nullableNumber(20, 300),
    bpm_confidence: nullableNumber(0, 1),
    bpm_explanation: nullableAnalysisExplanation,
    bpm_source: z.enum(["automatic", "manual", "metadata", "unknown"]).nullable(),
    client_id: z.string().uuid(),
    duration_seconds: nullableNumber(0, 31_536_000),
    energy: z.number().int().min(0).max(10).nullable(),
    energy_confidence: nullableNumber(0, 1),
    energy_source: z.enum(["automatic", "manual", "metadata", "unknown"]).nullable(),
    file_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    file_name: z.string().trim().min(1).max(500),
    file_size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    file_type: z.string().trim().min(1).max(120),
    genre: nullableText(120),
    genre_confidence: nullableNumber(0, 1),
    genre_source: z.enum(["automatic", "manual", "metadata", "unknown"]).nullable(),
    subgenre: nullableText(120),
    subgenre_confidence: nullableNumber(0, 1),
    subgenre_source: z.enum(["automatic", "manual", "metadata", "unknown"]).nullable(),
    key_confidence: nullableNumber(0, 1),
    key_explanation: nullableAnalysisExplanation,
    key_source: z.enum(["automatic", "manual", "metadata", "unknown"]).nullable(),
    musical_key: nullableText(16),
    release_year: z.number().int().min(1000).max(2100).nullable(),
    version_type: z
      .enum(["edit", "live", "original", "remaster", "remix", "unknown"])
      .nullable(),
    title: z.string().trim().min(1, "Añade el título.").max(300),
  })
  .strict()
  .superRefine((track, context) => {
    const analyses = [
      {
        confidence: track.bpm_confidence,
        confidencePath: "bpm_confidence",
        explanation: track.bpm_explanation,
        path: "bpm",
        source: track.bpm_source,
        value: track.bpm,
      },
      {
        confidence: track.key_confidence,
        confidencePath: "key_confidence",
        explanation: track.key_explanation,
        path: "musical_key",
        source: track.key_source,
        value: track.musical_key,
      },
    ] as const;

    for (const analysis of analyses) {
      if (
        analysis.value === null &&
        (analysis.source !== null ||
          analysis.confidence !== null ||
          analysis.explanation !== null)
      ) {
        context.addIssue({
          code: "custom",
          message: "El análisis no puede existir sin un valor.",
          path: [analysis.path],
        });
      }
      if (
        analysis.confidence !== null &&
        analysis.source !== "automatic"
      ) {
        context.addIssue({
          code: "custom",
          message: "La confianza solo se conserva para análisis automáticos.",
          path: [analysis.confidencePath],
        });
      }
    }
  });

export const importBatchSchema = z.array(importTrackSchema).min(1).max(25);

export const fingerprintBatchSchema = z
  .array(z.string().regex(/^[a-f0-9]{64}$/))
  .min(1)
  .max(100)
  .transform((fingerprints: string[]) => [...new Set(fingerprints)]);

export type ImportTrackInput = z.infer<typeof importTrackSchema>;

export function importValidationMessage(input: ImportTrackInput) {
  const result = importTrackSchema.safeParse(input);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Revisa los metadatos.";
}
