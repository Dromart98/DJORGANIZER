import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/types/database";

export const SMART_CRATE_MAX_GROUPS = 4;
export const SMART_CRATE_MAX_CONDITIONS = 12;
export const SMART_CRATE_PREVIEW_LIMIT = 8;

export const smartCrateFieldSchema = z.enum([
  "title",
  "artist",
  "album",
  "genre",
  "subgenre",
  "bpm",
  "bpm-range",
  "key",
  "camelot",
  "energy",
  "rating",
  "year",
  "tag",
]);

export type SmartCrateField = z.infer<typeof smartCrateFieldSchema>;
export type SmartCrateLogic = "and" | "or";
export type SmartCrateOperator =
  | "equals"
  | "contains"
  | "eq"
  | "gte"
  | "lte"
  | "between"
  | "has";

const numericField = new Set<SmartCrateField>([
  "bpm",
  "bpm-range",
  "energy",
  "rating",
  "year",
]);
const textField = new Set<SmartCrateField>([
  "title",
  "artist",
  "album",
  "genre",
  "subgenre",
  "key",
  "camelot",
]);

export const smartCrateConditionSchema = z
  .object({
    field: smartCrateFieldSchema,
    operator: z.enum([
      "equals",
      "contains",
      "eq",
      "gte",
      "lte",
      "between",
      "has",
    ]),
    value: z.union([z.string(), z.number()]),
    value2: z.union([z.string(), z.number()]).optional(),
  })
  .superRefine((condition, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: "custom", message, path: ["operator"] });

    if (textField.has(condition.field)) {
      if (!new Set(["equals", "contains"]).has(condition.operator)) {
        fail("Operador de texto no válido.");
      }
      if (typeof condition.value !== "string" || !condition.value.trim()) {
        context.addIssue({ code: "custom", message: "Añade un valor.", path: ["value"] });
      }
      if (typeof condition.value === "string" && condition.value.trim().length > 120) {
        context.addIssue({ code: "custom", message: "El valor es demasiado largo.", path: ["value"] });
      }
      return;
    }

    if (condition.field === "tag") {
      if (condition.operator !== "has" || typeof condition.value !== "string" || !z.string().uuid().safeParse(condition.value).success) {
        fail("Selecciona una etiqueta válida.");
      }
      return;
    }

    if (numericField.has(condition.field)) {
      const operators = condition.field === "bpm-range"
        ? new Set(["between"])
        : new Set(["eq", "gte", "lte", "between"]);
      if (!operators.has(condition.operator)) fail("Operador numérico no válido.");
      if (typeof condition.value !== "number" || !Number.isFinite(condition.value)) {
        context.addIssue({ code: "custom", message: "Añade un número válido.", path: ["value"] });
      }
      if (condition.operator === "between" && (typeof condition.value2 !== "number" || !Number.isFinite(condition.value2))) {
        context.addIssue({ code: "custom", message: "Añade el límite superior.", path: ["value2"] });
      }
      if (typeof condition.value === "number" && typeof condition.value2 === "number" && condition.operator === "between" && condition.value2 < condition.value) {
        context.addIssue({ code: "custom", message: "El límite superior debe ser mayor o igual.", path: ["value2"] });
      }
      const bounds: Partial<Record<SmartCrateField, [number, number]>> = {
        bpm: [20, 300],
        "bpm-range": [20, 300],
        energy: [0, 10],
        rating: [0, 5],
        year: [1000, 9999],
      };
      const range = bounds[condition.field];
      if (range) {
        for (const [path, value] of [["value", condition.value], ["value2", condition.value2]] as const) {
          if (typeof value === "number" && (value < range[0] || value > range[1])) {
            context.addIssue({ code: "custom", message: `Usa un valor entre ${range[0]} y ${range[1]}.`, path: [path] });
          }
        }
      }
    }
  });

export const smartCrateGroupSchema = z.object({
  logic: z.enum(["and", "or"]),
  conditions: z.array(smartCrateConditionSchema).min(1).max(SMART_CRATE_MAX_CONDITIONS),
});

export const smartCrateRulesSchema = z
  .object({
    version: z.literal(1),
    logic: z.enum(["and", "or"]),
    groups: z.array(smartCrateGroupSchema).min(1).max(SMART_CRATE_MAX_GROUPS),
  })
  .superRefine((rules, context) => {
    const total = rules.groups.reduce((sum, group) => sum + group.conditions.length, 0);
    if (total > SMART_CRATE_MAX_CONDITIONS) {
      context.addIssue({ code: "custom", message: `Usa como máximo ${SMART_CRATE_MAX_CONDITIONS} condiciones.`, path: ["groups"] });
    }
  });

export type SmartCrateRules = z.infer<typeof smartCrateRulesSchema>;

export function parseSmartCrateRules(value: unknown) {
  return smartCrateRulesSchema.safeParse(value);
}

export function parseSmartCrateRulesJson(value: string) {
  try {
    return smartCrateRulesSchema.safeParse(JSON.parse(value));
  } catch {
    return { success: false, error: new Error("JSON de reglas no válido.") } as const;
  }
}

export type SmartCrateResolvedPage = {
  count: number;
  tracks: Tables<"tracks">[];
};

export async function resolveSmartCrateTracks(
  supabase: SupabaseClient<Database>,
  rules: SmartCrateRules,
  options: { limit?: number; offset?: number; search?: string } = {},
): Promise<SmartCrateResolvedPage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 500);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  const { data, error } = await supabase.rpc("resolve_smart_crate_rule_tracks", {
    p_limit: limit,
    p_offset: offset,
    p_rules: rules as unknown as Json,
    p_search: options.search?.trim().slice(0, 100) || null,
  });
  if (error) throw new Error("No se pudo resolver el crate inteligente.");
  const rows = data ?? [];
  const count = rows.length ? Number(rows[0].total_count) : 0;
  const trackIds = rows.map((row) => row.track_id);
  if (!trackIds.length) return { count, tracks: [] };

  const { data: tracks, error: trackError } = await supabase
    .from("tracks")
    .select("*")
    .in("id", trackIds);
  if (trackError) throw new Error("No se pudieron cargar las pistas del crate inteligente.");
  const byId = new Map((tracks ?? []).map((track) => [track.id, track]));
  return {
    count,
    tracks: trackIds.flatMap((id) => byId.get(id) ?? []),
  };
}

export function smartCrateRulesToJson(rules: SmartCrateRules): Json {
  return rules as unknown as Json;
}
