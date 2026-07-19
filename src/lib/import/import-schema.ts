import { z } from "zod";

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .transform((value: string | null) => value || null);

const nullableNumber = (minimum: number, maximum: number) =>
  z.number().finite().min(minimum).max(maximum).nullable();

export const importTrackSchema = z
  .object({
    acoustic_fingerprint: nullableText(5000),
    album: nullableText(300),
    artist: nullableText(300),
    bpm: nullableNumber(20, 300),
    client_id: z.string().uuid(),
    duration_seconds: nullableNumber(0, 31_536_000),
    energy: z.number().int().min(0).max(100).nullable(),
    file_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    file_name: z.string().trim().min(1).max(500),
    file_size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    file_type: z.string().trim().min(1).max(120),
    genre: nullableText(120),
    genre_confidence: nullableNumber(0, 1),
    genre_source: z.enum(["manual", "metadata", "openai"]).nullable(),
    musical_key: nullableText(16),
    release_year: z.number().int().min(1000).max(2100).nullable(),
    version_type: z
      .enum(["edit", "live", "original", "remaster", "remix", "unknown"])
      .nullable(),
    title: z.string().trim().min(1, "Añade el título.").max(300),
  })
  .strict();

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
