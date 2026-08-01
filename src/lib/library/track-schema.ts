import { z } from "zod";
import { normalizeMusicalKey } from "@/lib/music/key-normalization";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
} from "@/lib/desktop/maest-analysis";

export const MAEST_EVIDENCE_FIELD = "maest_evidence";
const MAX_MAEST_EVIDENCE_LENGTH = 2_048;

const maestFieldEvidenceSchema = z.object({
  value: z.string().trim().min(1).max(120),
  analyzerId: z.literal(DESKTOP_MAEST_ANALYZER.id),
  analyzerVersion: z.literal(DESKTOP_MAEST_ANALYZER.version),
  compatibilityKey: z.literal(DESKTOP_MAEST_COMPATIBILITY_KEY),
  analyzedAt: z.string().regex(/^(?:0|[1-9]\d*)$/).refine(
    (value) => Number.isSafeInteger(Number(value)),
  ),
  rawScore: z.number().finite(),
}).strict();

const maestFormEvidenceSchema = z.object({
  genre: maestFieldEvidenceSchema.optional(),
  subgenre: maestFieldEvidenceSchema.optional(),
}).strict();

export type MaestFormEvidence = z.infer<typeof maestFormEvidenceSchema>;

export function maestEvidenceFromFormData(formData: FormData): MaestFormEvidence {
  const raw = formData.get(MAEST_EVIDENCE_FIELD);
  if (typeof raw !== "string" || raw.length > MAX_MAEST_EVIDENCE_LENGTH) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "genre" && key !== "subgenre")) return {};
    return maestFormEvidenceSchema.parse({
      ...(maestFieldEvidenceSchema.safeParse(record.genre).data
        ? { genre: maestFieldEvidenceSchema.parse(record.genre) }
        : {}),
      ...(maestFieldEvidenceSchema.safeParse(record.subgenre).data
        ? { subgenre: maestFieldEvidenceSchema.parse(record.subgenre) }
        : {}),
    });
  } catch {
    return {};
  }
}

const optionalText = (maximum: number) =>
  z.preprocess(
    (value: unknown) => value ?? "",
    z.string().trim().max(maximum).transform((value: string) => value || null),
  );

const optionalNumber = (minimum: number, maximum: number) =>
  z.preprocess(
    (value: unknown) =>
      value === "" || value === null ? undefined : value,
    z.coerce.number().min(minimum).max(maximum).optional(),
  );

const camelotKey = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value: string) =>
      value === "" || /^(?:[1-9]|1[0-2])[AB]$/.test(value),
    "Introduce una clave Camelot entre 1A y 12B.",
  )
  .transform((value: string) => value || null);

export const trackFormSchema = z.object({
  album: optionalText(300),
  artist: optionalText(300),
  bpm: optionalNumber(20, 300),
  camelot_key: camelotKey,
  comments: optionalText(5000),
  duration_seconds: optionalNumber(0, 31_536_000),
  energy: optionalNumber(0, 10),
  genre: optionalText(120),
  subgenre: optionalText(120),
  musical_key: optionalText(16),
  rating: optionalNumber(0, 5),
  release_year: optionalNumber(1000, 2100),
  title: z.string().trim().min(1, "El título es obligatorio.").max(300),
});

export const trackIdSchema = z.string().uuid("La canción indicada no es válida.");

export const trackIdsSchema = z
  .array(trackIdSchema)
  .min(1, "Selecciona al menos una canción.")
  .max(100, "Solo puedes eliminar 100 canciones cada vez.");

export type TrackFormValues = z.infer<typeof trackFormSchema>;

export function trackValuesFromFormData(formData: FormData): TrackFormValues {
  return trackFormSchema.parse({
    album: formData.get("album"),
    artist: formData.get("artist"),
    bpm: formData.get("bpm"),
    camelot_key: formData.get("camelot_key"),
    comments: formData.get("comments"),
    duration_seconds: formData.get("duration_seconds"),
    energy: formData.get("energy"),
    genre: formData.get("genre"),
    subgenre: formData.get("subgenre"),
    musical_key: formData.get("musical_key"),
    rating: formData.get("rating"),
    release_year: formData.get("release_year"),
    title: formData.get("title"),
  });
}

export function toTrackInsert(
  values: TrackFormValues,
  userId: string,
): TablesInsert<"tracks"> {
  const normalizedKey = normalizeMusicalKey(
    values.musical_key ?? values.camelot_key,
  );
  return {
    ...values,
    bpm: values.bpm ?? null,
    bpm_confidence: null,
    bpm_explanation:
      values.bpm === undefined ? null : "Valor revisado manualmente.",
    bpm_source: values.bpm === undefined ? null : "manual",
    duration_seconds: values.duration_seconds ?? null,
    energy: values.energy ?? null,
    energy_confidence: null,
    energy_source: values.energy === undefined ? null : "manual",
    genre_confidence: null,
    genre_source: values.genre ? "manual" : null,
    subgenre_confidence: null,
    subgenre_source: values.subgenre ? "manual" : null,
    camelot_key: normalizedKey?.camelotKey ?? values.camelot_key,
    key_confidence: null,
    key_explanation: normalizedKey ? "Valor revisado manualmente." : null,
    key_source: normalizedKey ? "manual" : null,
    musical_key: normalizedKey?.musicalKey ?? values.musical_key,
    rating: values.rating ?? null,
    release_year: values.release_year ?? null,
    user_id: userId,
  };
}

export type TrackAnalysisEvidence = Pick<
  Tables<"tracks">,
  | "bpm"
  | "bpm_confidence"
  | "bpm_explanation"
  | "bpm_source"
  | "camelot_key"
  | "energy"
  | "energy_confidence"
  | "energy_source"
  | "genre"
  | "genre_analyzed_at_ms"
  | "genre_analyzer_id"
  | "genre_analyzer_version"
  | "genre_compatibility_key"
  | "genre_confidence"
  | "genre_raw_score"
  | "genre_source"
  | "key_confidence"
  | "key_explanation"
  | "key_source"
  | "musical_key"
  | "subgenre"
  | "subgenre_analyzed_at_ms"
  | "subgenre_analyzer_id"
  | "subgenre_analyzer_version"
  | "subgenre_compatibility_key"
  | "subgenre_confidence"
  | "subgenre_raw_score"
  | "subgenre_source"
>;

export function toTrackUpdate(
  values: TrackFormValues,
  persisted: TrackAnalysisEvidence,
  maestEvidence: MaestFormEvidence = {},
): TablesUpdate<"tracks"> {
  const normalizedKey = normalizeMusicalKey(
    values.musical_key ?? values.camelot_key,
  );
  const persistedKey = normalizeMusicalKey(
    persisted.musical_key ?? persisted.camelot_key,
  );
  const bpm = values.bpm ?? null;
  const energy = values.energy ?? null;
  const musicalKey = normalizedKey?.musicalKey ?? values.musical_key;
  const camelotKey = normalizedKey?.camelotKey ?? values.camelot_key;
  const bpmChanged = bpm !== persisted.bpm;
  const energyChanged = energy !== persisted.energy;
  const genreChanged = values.genre !== persisted.genre;
  const subgenreChanged = values.subgenre !== persisted.subgenre;
  const keyChanged =
    musicalKey !== (persistedKey?.musicalKey ?? persisted.musical_key) ||
    camelotKey !== (persistedKey?.camelotKey ?? persisted.camelot_key);

  const classificationEvidence = (
    field: "genre" | "subgenre",
    changed: boolean,
  ) => {
    if (!changed) return {};
    const value = values[field];
    const evidence = maestEvidence[field];
    const prefix = field;
    if (!value) {
      return {
        [`${prefix}_source`]: null,
        [`${prefix}_confidence`]: null,
        [`${prefix}_analyzer_id`]: null,
        [`${prefix}_analyzer_version`]: null,
        [`${prefix}_compatibility_key`]: null,
        [`${prefix}_analyzed_at_ms`]: null,
        [`${prefix}_raw_score`]: null,
      };
    }
    const automatic = evidence?.value === value;
    return {
      [`${prefix}_source`]: automatic ? "automatic" : "manual",
      [`${prefix}_confidence`]: null,
      [`${prefix}_analyzer_id`]: automatic ? evidence.analyzerId : null,
      [`${prefix}_analyzer_version`]: automatic ? evidence.analyzerVersion : null,
      [`${prefix}_compatibility_key`]: automatic ? evidence.compatibilityKey : null,
      [`${prefix}_analyzed_at_ms`]: automatic ? Number(evidence.analyzedAt) : null,
      [`${prefix}_raw_score`]: automatic ? evidence.rawScore : null,
    };
  };

  return {
    ...values,
    bpm,
    ...(bpmChanged
      ? {
          bpm_confidence: null,
          bpm_explanation: bpm === null ? null : "Valor revisado manualmente.",
          bpm_source: bpm === null ? null : "manual",
        }
      : {}),
    duration_seconds: values.duration_seconds ?? null,
    energy,
    ...(energyChanged
      ? {
          energy_confidence: null,
          energy_source: energy === null ? null : "manual",
        }
      : {}),
    ...classificationEvidence("genre", genreChanged),
    ...classificationEvidence("subgenre", subgenreChanged),
    camelot_key: camelotKey,
    ...(keyChanged
      ? {
          key_confidence: null,
          key_explanation:
            normalizedKey === null ? null : "Valor revisado manualmente.",
          key_source: normalizedKey === null ? null : "manual",
        }
      : {}),
    musical_key: musicalKey,
    rating: values.rating ?? null,
    release_year: values.release_year ?? null,
  };
}
