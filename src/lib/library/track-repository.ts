import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import {
  databaseSortColumn,
  safeSearchTerm,
  TRACKS_PER_PAGE,
  type TrackQuery,
} from "./track-query";

export type TrackPage = {
  count: number;
  page: number;
  pageCount: number;
  tracks: Tables<"tracks">[];
};

export async function listTracks(
  supabase: SupabaseClient<Database>,
  userId: string,
  query: TrackQuery,
): Promise<TrackPage> {
  const from = (query.page - 1) * TRACKS_PER_PAGE;
  const to = from + TRACKS_PER_PAGE - 1;
  const sortColumn = databaseSortColumn(query.sort);

  let request = supabase
    .from("tracks")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  const search = query.q ? safeSearchTerm(query.q) : "";
  if (search) {
    const pattern = `%${search}%`;
    request = request.or(
      `title.ilike.${pattern},artist.ilike.${pattern},album.ilike.${pattern}`,
    );
  }

  if (query.genre) request = request.ilike("genre", query.genre);
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

  const { count, data, error } = await request
    .order(sortColumn, {
      ascending: query.direction === "asc",
      nullsFirst: false,
    })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    throw new Error("No se pudo cargar la biblioteca.");
  }

  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / TRACKS_PER_PAGE));

  return {
    count: total,
    page: Math.min(query.page, pageCount),
    pageCount,
    tracks: data ?? [],
  };
}

export async function getTrack(
  supabase: SupabaseClient<Database>,
  userId: string,
  trackId: string,
) {
  const { data, error } = await supabase
    .from("tracks")
    .select("*")
    .eq("id", trackId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar la canción.");
  }

  return data;
}
