import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export type TrackCrate = Pick<Tables<"crates">, "id" | "name">;

const MEMBERSHIP_PAGE_SIZE = 500;
const CRATE_LOOKUP_CHUNK_SIZE = 100;

export function sortTrackCrates(crates: readonly TrackCrate[]) {
  return [...crates].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
  );
}

export async function listManualCratesForTrack(
  supabase: SupabaseClient<Database>,
  userId: string,
  trackId: string,
): Promise<TrackCrate[]> {
  const crateIds: string[] = [];

  for (let from = 0; ; from += MEMBERSHIP_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("crate_tracks")
      .select("crate_id, created_at")
      .eq("user_id", userId)
      .eq("track_id", trackId)
      .order("created_at", { ascending: true })
      .order("crate_id", { ascending: true })
      .range(from, from + MEMBERSHIP_PAGE_SIZE - 1);
    if (error) throw new Error("No se pudieron cargar los crates de la pista.");
    const page = data ?? [];
    crateIds.push(...page.map((membership) => membership.crate_id));
    if (page.length < MEMBERSHIP_PAGE_SIZE) break;
  }

  const uniqueIds = [...new Set(crateIds)];
  if (!uniqueIds.length) return [];

  const crates: TrackCrate[] = [];
  for (let start = 0; start < uniqueIds.length; start += CRATE_LOOKUP_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(start, start + CRATE_LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("crates")
      .select("id, name")
      .eq("user_id", userId)
      .is("smart_rules", null)
      .in("id", chunk);
    if (error) throw new Error("No se pudieron cargar los crates de la pista.");
    crates.push(...(data ?? []));
  }

  return sortTrackCrates(crates);
}
