import type { SortDirection, Track, TrackSortKey } from "@/types/music";

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function sortTracks(tracks: readonly Track[], key: TrackSortKey, direction: SortDirection): Track[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...tracks].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))) * multiplier;
  });
}
