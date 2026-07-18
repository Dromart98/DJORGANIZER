import { z } from "zod";

export const organizationIdSchema = z.string().uuid();

export const crateValuesSchema = z.object({
  description: z
    .string()
    .trim()
    .max(1000, "La descripción no puede superar 1000 caracteres.")
    .transform((value: string) => value || null),
  name: z
    .string()
    .trim()
    .min(1, "Añade un nombre.")
    .max(120, "El nombre no puede superar 120 caracteres."),
});

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Añade un nombre.")
  .max(80, "El nombre no puede superar 80 caracteres.");

export const trackAssignmentSchema = z.object({
  crateId: organizationIdSchema,
  trackId: organizationIdSchema,
});

export const tagAssignmentSchema = z.object({
  tagId: organizationIdSchema,
  trackIds: z.array(organizationIdSchema).min(1).max(100),
});

export const moveTrackSchema = trackAssignmentSchema.extend({
  direction: z.enum(["up", "down"]),
});

export function crateValuesFromFormData(formData: FormData) {
  return crateValuesSchema.parse({
    description: formData.get("description"),
    name: formData.get("name"),
  });
}

export function moveTrackIds(
  orderedIds: readonly string[],
  trackId: string,
  direction: "up" | "down",
) {
  const currentIndex = orderedIds.indexOf(trackId);
  if (currentIndex < 0) return [...orderedIds];

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= orderedIds.length) {
    return [...orderedIds];
  }

  const result = [...orderedIds];
  [result[currentIndex], result[targetIndex]] = [
    result[targetIndex],
    result[currentIndex],
  ];
  return result;
}
