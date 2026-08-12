import { z } from "zod";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
} from "@/lib/desktop/maest-analysis";
import { trackIdSchema } from "@/lib/library/track-schema";
import type { TablesUpdate } from "@/types/database";

export const MAX_MAEST_BATCH_APPLY_TRACKS = 25;

const fieldEvidenceSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
    analyzerId: z.literal(DESKTOP_MAEST_ANALYZER.id),
    analyzerVersion: z.literal(DESKTOP_MAEST_ANALYZER.version),
    compatibilityKey: z.literal(DESKTOP_MAEST_COMPATIBILITY_KEY),
    analyzedAt: z
      .string()
      .regex(/^(?:0|[1-9]\d*)$/)
      .refine((value) => Number.isSafeInteger(Number(value))),
    rawScore: z.number().finite(),
  })
  .strict();

const fieldSelectionSchema = z
  .object({
    expectedValue: z.string().max(120).nullable(),
    evidence: fieldEvidenceSchema,
  })
  .strict();

const itemSchema = z
  .object({
    trackId: trackIdSchema,
    genre: fieldSelectionSchema.optional(),
    subgenre: fieldSelectionSchema.optional(),
  })
  .strict()
  .refine((item) => Boolean(item.genre || item.subgenre), {
    message: "Selecciona al menos un campo MAEST.",
  });

const requestSchema = z
  .object({
    items: z.array(itemSchema).min(1).max(MAX_MAEST_BATCH_APPLY_TRACKS),
  })
  .strict()
  .superRefine((request, context) => {
    const ids = new Set<string>();
    request.items.forEach((item, index) => {
      if (ids.has(item.trackId)) {
        context.addIssue({
          code: "custom",
          message: "Una pista solo puede aparecer una vez.",
          path: ["items", index, "trackId"],
        });
      }
      ids.add(item.trackId);
    });
  });

export type MaestBatchApplyRequest = z.infer<typeof requestSchema>;
export type MaestBatchApplyFieldEvidence = z.infer<typeof fieldEvidenceSchema>;
export type MaestBatchApplyField = "genre" | "subgenre";
export type MaestBatchApplyFieldStatus =
  | "applied"
  | "omitted"
  | "conflict"
  | "failed";
export type MaestBatchApplyItemStatus = MaestBatchApplyFieldStatus;
export type MaestBatchApplyItemResult = {
  trackId: string;
  status: MaestBatchApplyItemStatus;
  genre: MaestBatchApplyFieldStatus;
  subgenre: MaestBatchApplyFieldStatus;
};
export type MaestBatchApplyResult = {
  status: "ok" | "invalid";
  items: MaestBatchApplyItemResult[];
};

export type MaestBatchApplyCurrent = {
  genre: string | null;
  subgenre: string | null;
};

export type MaestBatchApplyStore = {
  read(trackId: string): Promise<MaestBatchApplyCurrent | null>;
  compareAndSet(
    trackId: string,
    field: MaestBatchApplyField,
    expectedValue: string | null,
    evidence: MaestBatchApplyFieldEvidence,
  ): Promise<"applied" | "conflict" | "failed">;
};

export function parseMaestBatchApplyRequest(input: unknown): MaestBatchApplyRequest {
  return requestSchema.parse(input);
}

export function maestAutomaticClassificationUpdate(
  field: MaestBatchApplyField,
  evidence: MaestBatchApplyFieldEvidence,
): TablesUpdate<"tracks"> {
  const analyzedAt = Number(evidence.analyzedAt);
  if (field === "genre") {
    return {
      genre: evidence.value,
      genre_source: "automatic",
      genre_confidence: null,
      genre_analyzer_id: evidence.analyzerId,
      genre_analyzer_version: evidence.analyzerVersion,
      genre_compatibility_key: evidence.compatibilityKey,
      genre_analyzed_at_ms: analyzedAt,
      genre_raw_score: evidence.rawScore,
    };
  }
  return {
    subgenre: evidence.value,
    subgenre_source: "automatic",
    subgenre_confidence: null,
    subgenre_analyzer_id: evidence.analyzerId,
    subgenre_analyzer_version: evidence.analyzerVersion,
    subgenre_compatibility_key: evidence.compatibilityKey,
    subgenre_analyzed_at_ms: analyzedAt,
    subgenre_raw_score: evidence.rawScore,
  };
}

function itemStatus(
  genre: MaestBatchApplyFieldStatus,
  subgenre: MaestBatchApplyFieldStatus,
): MaestBatchApplyItemStatus {
  if (genre === "failed" || subgenre === "failed") return "failed";
  if (genre === "conflict" || subgenre === "conflict") return "conflict";
  if (genre === "applied" || subgenre === "applied") return "applied";
  return "omitted";
}

export async function executeMaestBatchApply(
  request: MaestBatchApplyRequest,
  store: MaestBatchApplyStore,
): Promise<MaestBatchApplyItemResult[]> {
  const results: MaestBatchApplyItemResult[] = [];

  for (const item of request.items) {
    let current: MaestBatchApplyCurrent | null;
    try {
      current = await store.read(item.trackId);
    } catch {
      current = null;
    }

    if (!current) {
      const genre = item.genre ? "failed" : "omitted";
      const subgenre = item.subgenre ? "failed" : "omitted";
      results.push({
        trackId: item.trackId,
        genre,
        subgenre,
        status: itemStatus(genre, subgenre),
      });
      continue;
    }

    const statuses: Record<MaestBatchApplyField, MaestBatchApplyFieldStatus> = {
      genre: "omitted",
      subgenre: "omitted",
    };

    for (const field of ["genre", "subgenre"] as const) {
      const selection = item[field];
      if (!selection) continue;
      if (current[field] !== selection.expectedValue) {
        statuses[field] = "conflict";
        continue;
      }

      try {
        statuses[field] = await store.compareAndSet(
          item.trackId,
          field,
          selection.expectedValue,
          selection.evidence,
        );
      } catch {
        statuses[field] = "failed";
      }

      if (statuses[field] === "applied") {
        current[field] = selection.evidence.value;
      }
    }

    results.push({
      trackId: item.trackId,
      genre: statuses.genre,
      subgenre: statuses.subgenre,
      status: itemStatus(statuses.genre, statuses.subgenre),
    });
  }

  return results;
}
