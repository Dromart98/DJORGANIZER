import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import {
  compatibleBpmRange,
  compatibleCamelotKeys,
} from "@/lib/music/harmonic-compatibility";
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

export type TrackTag = Pick<Tables<"tags">, "id" | "name">;
export type TrackTagsByTrackId = Record<string, TrackTag[]>;

type TrackTagRelation = Pick<Tables<"track_tags">, "tag_id" | "track_id">;

export function mapTrackTags(
  trackIds: string[],
  tags: TrackTag[],
  relations: TrackTagRelation[],
): TrackTagsByTrackId {
  const requestedIds = new Set(trackIds);
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const result = Object.fromEntries(trackIds.map((id) => [id, []])) as TrackTagsByTrackId;
  const seen = new Set<string>();

  for (const relation of relations) {
    const tag = tagsById.get(relation.tag_id);
    const relationKey = `${relation.track_id}:${relation.tag_id}`;
    if (!requestedIds.has(relation.track_id) || !tag || seen.has(relationKey)) continue;
    seen.add(relationKey);
    result[relation.track_id].push(tag);
  }

  for (const trackTags of Object.values(result)) {
    trackTags.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
    );
  }
  return result;
}

export async function listTrackTags(
  supabase: SupabaseClient<Database>,
  userId: string,
  trackIds: string[],
  tags: TrackTag[],
): Promise<TrackTagsByTrackId> {
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return {};
  const { data, error } = await supabase
    .from("track_tags")
    .select("track_id, tag_id")
    .eq("user_id", userId)
    .in("track_id", uniqueTrackIds);
  if (error) throw new Error("No se pudieron cargar las etiquetas de las canciones.");
  return mapTrackTags(uniqueTrackIds, tags, data ?? []);
}

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

export async function listCompatibleTracks(
  supabase: SupabaseClient<Database>,
  userId: string,
  source: Tables<"tracks">,
) {
  const matches = compatibleCamelotKeys(source.camelot_key);
  if (!matches.length) return [];
  const reasons = new Map(
    matches.map((match) => [match.camelotKey, match.reason]),
  );
  let request = supabase
    .from("tracks")
    .select("*")
    .eq("user_id", userId)
    .neq("id", source.id)
    .in("camelot_key", matches.map((match) => match.camelotKey));
  const bpmRange = compatibleBpmRange(source.bpm);
  if (bpmRange) {
    request = request
      .gte("bpm", bpmRange.minimum)
      .lte("bpm", bpmRange.maximum);
  }
  const { data, error } = await request.limit(30);
  if (error) throw new Error("No se pudieron cargar las recomendaciones.");

  return (data ?? [])
    .sort((left, right) => {
      const leftExact = left.camelot_key === source.camelot_key ? 0 : 1;
      const rightExact = right.camelot_key === source.camelot_key ? 0 : 1;
      if (leftExact !== rightExact) return leftExact - rightExact;
      return Math.abs((left.bpm ?? 0) - (source.bpm ?? 0)) -
        Math.abs((right.bpm ?? 0) - (source.bpm ?? 0));
    })
    .slice(0, 8)
    .map((track) => ({
      ...track,
      compatibility_reason:
        reasons.get(track.camelot_key ?? "") ?? "Tonalidad compatible",
    }));
}

