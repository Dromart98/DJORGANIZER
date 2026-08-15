import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

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

export function mergeCrateTrackIds(
  targetTrackIds: string[],
  sourceTrackIds: string[],
) {
  const target = [...new Set(targetTrackIds)];
  const seen = new Set(target);
  const merged = [...target];
  for (const trackId of sourceTrackIds) {
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    merged.push(trackId);
  }
  return merged;
}

export async function resolveComparableCrateTrackIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  crate: ComparableCrate,
) {
  if (crate.smart_rules !== null) {
    throw new Error("Las herramientas avanzadas operan sobre crates manuales.");
  }

  const trackIds: string[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("crate_tracks")
      .select("track_id, position, created_at")
      .eq("user_id", userId)
      .eq("crate_id", crate.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("track_id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error("No se pudo cargar el contenido del crate.");
    const page = data ?? [];
    trackIds.push(...page.map((membership) => membership.track_id));
    if (page.length < 500) break;
  }

  return [...new Set(trackIds)];
}
