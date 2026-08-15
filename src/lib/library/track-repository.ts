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

const TAG_QUERY_PAGE_SIZE = 500;

type TrackTagRelation = Pick<Tables<"track_tags">, "tag_id" | "track_id"> & {
  tags: TrackTag | TrackTag[];
};

export function mapTrackTags(
  trackIds: string[],
  relations: TrackTagRelation[],
): TrackTagsByTrackId {
  const requestedIds = new Set(trackIds);
  const result = Object.fromEntries(trackIds.map((id) => [id, []])) as TrackTagsByTrackId;
  const seen = new Set<string>();

  for (const relation of relations) {
    const tag = Array.isArray(relation.tags) ? relation.tags[0] : relation.tags;
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
): Promise<TrackTagsByTrackId> {
  const uniqueTrackIds = [...new Set(trackIds)];
  if (!uniqueTrackIds.length) return {};
  const relations: TrackTagRelation[] = [];

  for (let from = 0; ; from += TAG_QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("track_tags")
      .select("track_id, tag_id, tags!track_tags_tag_id_user_id_fkey(id, name)")
      .eq("user_id", userId)
      .in("track_id", uniqueTrackIds)
      .order("track_id", { ascending: true })
      .order("tag_id", { ascending: true })
      .range(from, from + TAG_QUERY_PAGE_SIZE - 1);
    if (error) throw new Error("No se pudieron cargar las etiquetas de las canciones.");
    const page = (data ?? []) as TrackTagRelation[];
    relations.push(...page);
    if (page.length < TAG_QUERY_PAGE_SIZE) break;
  }
  return mapTrackTags(uniqueTrackIds, relations);
}

/** Loads the reusable catalog in bounded requests because the current UI offers it in selectors. */
export async function listUserTags(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TrackTag[]> {
  const tags: TrackTag[] = [];
  for (let from = 0; ; from += TAG_QUERY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tags")
      .select("id, name")
      .eq("user_id", userId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + TAG_QUERY_PAGE_SIZE - 1);
    if (error) throw new Error("No se pudieron cargar las etiquetas.");
    const page = data ?? [];
    tags.push(...page);
    if (page.length < TAG_QUERY_PAGE_SIZE) break;
  }
  const seen = new Set<string>();
  return tags
    .filter((tag) => {
      if (seen.has(tag.id)) return false;
      seen.add(tag.id);
      return true;
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
      left.id.localeCompare(right.id),
    );
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

  if (query.status === "active") request = request.is("archived_at", null);
  if (query.status === "archived") request = request.not("archived_at", "is", null);

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
  if (source.archived_at) return [];
  const matches = compatibleCamelotKeys(source.camelot_key);
  if (!matches.length) return [];
  const reasons = new Map(
    matches.map((match) => [match.camelotKey, match.reason]),
  );
  let request = supabase
    .from("tracks")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
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
