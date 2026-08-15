import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import {
  parseSmartCrateRules,
  resolveAllSmartCrateTrackIds,
} from "@/lib/organization/smart-crates";

export type ComparableCrate = Pick<
  Tables<"crates">,
  "id" | "name" | "smart_rules"
>;

export type CrateComparison = {
  common: string[];
  leftOnly: string[];
  rightOnly: string[];
};

export function compareCrateTrackIds(
  leftTrackIds: string[],
  rightTrackIds: string[],
): CrateComparison {
  const left = [...new Set(leftTrackIds)];
  const right = [...new Set(rightTrackIds)];
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return {
    common: left.filter((id) => rightSet.has(id)),
    leftOnly: left.filter((id) => !rightSet.has(id)),
    rightOnly: right.filter((id) => !leftSet.has(id)),
  };
}

export async function resolveComparableCrateTrackIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  crate: ComparableCrate,
) {
  if (crate.smart_rules !== null) {
    const parsed = parseSmartCrateRules(crate.smart_rules);
    if (!parsed.success) {
      throw new Error("El crate inteligente tiene reglas no válidas.");
    }
    return resolveAllSmartCrateTrackIds(supabase, parsed.data);
  }

  const trackIds: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("crate_tracks")
      .select("track_id, position")
      .eq("user_id", userId)
      .eq("crate_id", crate.id)
      .order("position", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error("No se pudo cargar el contenido del crate.");
    const page = data ?? [];
    trackIds.push(...page.map((membership) => membership.track_id));
    if (page.length < 500) break;
  }

  return [...new Set(trackIds)];
}
