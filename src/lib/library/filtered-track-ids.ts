import type { SupabaseClient } from "@supabase/supabase-js";
import {
  databaseSortColumn,
  safeSearchTerm,
  type TrackQuery,
} from "@/lib/library/track-query";
import type { Database } from "@/types/database";

const FILTERED_TRACK_ID_PAGE_SIZE = 1_000;

export async function listFilteredTrackIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: TrackQuery,
) {
  const ids: string[] = [];
  const sortColumn = databaseSortColumn(query.sort);

  for (let from = 0; ; from += FILTERED_TRACK_ID_PAGE_SIZE) {
    let request = supabase
      .from("tracks")
      .select("id")
      .eq("user_id", userId);

    const search = query.q ? safeSearchTerm(query.q) : "";
    if (search) {
      const pattern = `%${search}%`;
      request = request.or(
        `title.ilike.${pattern},artist.ilike.${pattern},album.ilike.${pattern},genre.ilike.${pattern},subgenre.ilike.${pattern}`,
      );
    }

    if (query.genre) request = request.ilike("genre", query.genre);
    if (query.subgenre) request = request.ilike("subgenre", query.subgenre);
    if (query.bpmMin !== undefined) request = request.gte("bpm", query.bpmMin);
    if (query.bpmMax !== undefined) request = request.lte("bpm", query.bpmMax);
    if (query.key) request = request.ilike("musical_key", query.key);
    if (query.camelot)
      request = request.eq("camelot_key", query.camelot.toUpperCase());
    if (query.energyMin !== undefined)
      request = request.gte("energy", query.energyMin);
    if (query.energyMax !== undefined)
      request = request.lte("energy", query.energyMax);
    if (query.rating !== undefined) request = request.gte("rating", query.rating);

    const { data, error } = await request
      .order(sortColumn, {
        ascending: query.direction === "asc",
        nullsFirst: false,
      })
      .order("id", { ascending: true })
      .range(from, from + FILTERED_TRACK_ID_PAGE_SIZE - 1);

    if (error) throw new Error("No se pudieron resolver los filtros activos.");

    const page = data ?? [];
    ids.push(...page.map((track) => track.id));
    if (page.length < FILTERED_TRACK_ID_PAGE_SIZE) break;
  }

  return ids;
}
