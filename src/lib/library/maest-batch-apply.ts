import { z } from "zod";
import { DESKTOP_MAEST_ANALYZER, DESKTOP_MAEST_COMPATIBILITY_KEYS } from "@/lib/desktop/maest-analysis";
import type { TablesUpdate } from "@/types/database";

export const MAX_MAEST_BATCH_APPLICATIONS = 25;

const currentValueSchema = z.string().max(120).nullable();
const evidenceSchema = z.object({
  value: z.string().trim().min(1).max(120),
  analyzerId: z.literal(DESKTOP_MAEST_ANALYZER.id),
  analyzerVersion: z.literal(DESKTOP_MAEST_ANALYZER.version),
  compatibilityKey: z.enum(DESKTOP_MAEST_COMPATIBILITY_KEYS),
  analyzedAt: z.string().regex(/^(?:0|[1-9]\d*)$/).refine((value) => Number.isSafeInteger(Number(value))),
  rawScore: z.number().finite(),
}).strict();

export const maestBatchApplicationSchema = z.object({
  trackId: z.string().uuid(),
  expected: z.object({ genre: currentValueSchema, subgenre: currentValueSchema }).strict(),
  fields: z.object({ genre: evidenceSchema.optional(), subgenre: evidenceSchema.optional() })
    .strict()
    .refine((fields) => Boolean(fields.genre || fields.subgenre)),
}).strict();

export const maestBatchApplicationsSchema = z.array(maestBatchApplicationSchema)
  .min(1)
  .max(MAX_MAEST_BATCH_APPLICATIONS)
  .refine((items) => new Set(items.map((item) => item.trackId)).size === items.length);

export type MaestBatchApplication = z.infer<typeof maestBatchApplicationSchema>;
export type MaestBatchApplicationResult = {
  trackId: string;
  status: "applied" | "omitted" | "conflict" | "failed";
  appliedFields?: Array<"genre" | "subgenre">;
};

export function parseMaestBatchApplications(payload: unknown) {
  const envelope = z.array(z.unknown()).min(1).max(MAX_MAEST_BATCH_APPLICATIONS).safeParse(payload);
  if (!envelope.success) return { applications: [], rejectedTrackIds: [] };
  const applications: MaestBatchApplication[] = [];
  const rejectedTrackIds: string[] = [];
  const seen = new Set<string>();
  for (const candidate of envelope.data) {
    const parsed = maestBatchApplicationSchema.safeParse(candidate);
    const candidateId = candidate && typeof candidate === "object" && "trackId" in candidate
      ? z.string().uuid().safeParse(candidate.trackId).data
      : undefined;
    if (!parsed.success || seen.has(parsed.data.trackId)) {
      if (candidateId) rejectedTrackIds.push(candidateId);
      continue;
    }
    seen.add(parsed.data.trackId);
    applications.push(parsed.data);
  }
  return { applications, rejectedTrackIds };
}

export function maestBatchTrackUpdate(application: MaestBatchApplication) {
  const update: TablesUpdate<"tracks"> = {};
  const appliedFields: Array<"genre" | "subgenre"> = [];
  for (const field of ["genre", "subgenre"] as const) {
    const evidence = application.fields[field];
    if (!evidence || evidence.value === application.expected[field]) continue;
    appliedFields.push(field);
    Object.assign(update, {
      [field]: evidence.value,
      [`${field}_source`]: "automatic",
      [`${field}_confidence`]: null,
      [`${field}_analyzer_id`]: evidence.analyzerId,
      [`${field}_analyzer_version`]: evidence.analyzerVersion,
      [`${field}_compatibility_key`]: evidence.compatibilityKey,
      [`${field}_analyzed_at_ms`]: Number(evidence.analyzedAt),
      [`${field}_raw_score`]: evidence.rawScore,
    });
  }
  return { update, appliedFields };
}
