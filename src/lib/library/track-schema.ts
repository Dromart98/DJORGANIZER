import { z } from "zod";
import { normalizeMusicalKey } from "@/lib/music/key-normalization";
import type { TablesInsert, TablesUpdate } from "@/types/database";

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

export function toTrackUpdate(
  values: TrackFormValues,
): TablesUpdate<"tracks"> {
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
  };
}
