import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const crateSortKeys = ["bpm", "camelot", "energy", "rating"] as const;
export const crateSortDirections = ["asc", "desc"] as const;

export type CrateSortKey = (typeof crateSortKeys)[number];
export type CrateSortDirection = (typeof crateSortDirections)[number];

export type CrateSortTrack = {
  artist: string | null;
  bpm: number | null;
  camelot_key: string | null;
  energy: number | null;
  id: string;
  rating: number | null;
  title: string;
};

function camelotRank(value: string | null) {
  const match = value?.toUpperCase().match(/^(1[0-2]|[1-9])([AB])$/);
  if (!match) return null;
  const number = Number(match[1]);
  const letterOffset = match[2] === "A" ? 0 : 1;
  return (number - 1) * 2 + letterOffset;
}

function sortValue(track: CrateSortTrack, key: CrateSortKey) {
  switch (key) {
    case "bpm":
      return track.bpm;
    case "camelot":
      return camelotRank(track.camelot_key);
    case "energy":
      return track.energy;
    case "rating":
      return track.rating;
  }
}

export function sortCrateTracks(
  tracks: CrateSortTrack[],
  key: CrateSortKey,
  direction: CrateSortDirection,
) {
  return tracks
    .map((track, originalIndex) => ({ originalIndex, track }))
    .sort((left, right) => {
      const leftValue = sortValue(left.track, key);
      const rightValue = sortValue(right.track, key);
      if (leftValue === null && rightValue === null) {
        return left.originalIndex - right.originalIndex;
      }
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      if (leftValue !== rightValue) {
        return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return left.originalIndex - right.originalIndex;
    })
    .map(({ track }) => track);
}

export async function loadCrateSortTracks(
  supabase: SupabaseClient<Database>,
  userId: string,
  trackIds: string[],
) {
  const byId = new Map<string, CrateSortTrack>();
  for (let from = 0; from < trackIds.length; from += 500) {
    const ids = trackIds.slice(from, from + 500);
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, artist, bpm, camelot_key, energy, rating")
      .eq("user_id", userId)
      .in("id", ids);
    if (error) throw new Error("No se pudieron cargar los datos de ordenación.");
    for (const track of data ?? []) byId.set(track.id, track);
  }

  const tracks = trackIds.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
  if (tracks.length !== trackIds.length) {
    throw new Error("El crate contiene una pista que ya no está disponible.");
  }
  return tracks;
}

export function isCrateSortKey(value: string | undefined): value is CrateSortKey {
  return crateSortKeys.includes(value as CrateSortKey);
}

export function isCrateSortDirection(
  value: string | undefined,
): value is CrateSortDirection {
  return crateSortDirections.includes(value as CrateSortDirection);
}
