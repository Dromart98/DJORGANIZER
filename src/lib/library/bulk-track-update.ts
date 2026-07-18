import { z } from "zod";
import { normalizeMusicalKey } from "@/lib/music/key-normalization";
import { trackIdSchema } from "@/lib/library/track-schema";
import type { TablesUpdate } from "@/types/database";

export const BULK_EDITABLE_FIELDS = [
  "album",
  "genre",
  "bpm",
  "musical_key",
  "energy",
  "rating",
  "release_year",
  "comments",
] as const;

export type BulkEditableField = (typeof BULK_EDITABLE_FIELDS)[number];

export type BulkTrackUpdate = {
  field: BulkEditableField;
  trackIds: string[];
  update: TablesUpdate<"tracks">;
};

const baseSchema = z.object({
  field: z.enum(BULK_EDITABLE_FIELDS),
  trackIds: z
    .array(trackIdSchema)
    .min(1, "Selecciona al menos una canción.")
    .max(100, "Solo puedes actualizar 100 canciones cada vez."),
  value: z.string(),
});

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null);

const nullableNumber = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.coerce.number().min(minimum).max(maximum).nullable(),
  );

const musicalKey = optionalText(16).refine(
  (value) => value === null || normalizeMusicalKey(value) !== null,
  "Introduce una tonalidad válida, como Am, F# major o 8A.",
);

export function parseBulkTrackUpdate(input: unknown): BulkTrackUpdate {
  const parsed = baseSchema.parse(input);
  const common = { field: parsed.field, trackIds: parsed.trackIds };

  switch (parsed.field) {
    case "album":
      return {
        ...common,
        update: { album: optionalText(300).parse(parsed.value) },
      };
    case "genre":
      return {
        ...common,
        update: { genre: optionalText(120).parse(parsed.value) },
      };
    case "bpm":
      return {
        ...common,
        update: { bpm: nullableNumber(20, 300).parse(parsed.value) },
      };
    case "musical_key": {
      const value = musicalKey.parse(parsed.value);
      const normalized = normalizeMusicalKey(value);
      return {
        ...common,
        update: {
          camelot_key: normalized?.camelotKey ?? null,
          musical_key: normalized?.musicalKey ?? null,
        },
      };
    }
    case "energy":
      return {
        ...common,
        update: { energy: nullableNumber(0, 100).parse(parsed.value) },
      };
    case "rating":
      return {
        ...common,
        update: { rating: nullableNumber(0, 5).parse(parsed.value) },
      };
    case "release_year":
      return {
        ...common,
        update: {
          release_year: nullableNumber(1000, 2100).parse(parsed.value),
        },
      };
    case "comments":
      return {
        ...common,
        update: { comments: optionalText(5000).parse(parsed.value) },
      };
  }
}

export function bulkTrackUpdateFromFormData(
  formData: FormData,
): BulkTrackUpdate {
  return parseBulkTrackUpdate({
    field: formData.get("field"),
    trackIds: formData.getAll("trackId"),
    value: formData.get("value"),
  });
}
