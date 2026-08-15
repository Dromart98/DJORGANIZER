import type { Tables } from "@/types/database";

export type CrateToolSortField = "bpm" | "camelot" | "energy" | "rating";
export type CrateToolSortDirection = "asc" | "desc";

export type CrateToolTrack = Pick<
  Tables<"tracks">,
  | "artist"
  | "bpm"
  | "camelot_key"
  | "energy"
  | "file_fingerprint"
  | "id"
  | "rating"
  | "title"
>;

export type CrateComparison = {
  common: string[];
  leftOnly: string[];
  rightOnly: string[];
};

export type CrateDedupePreview = {
  keptTrackIds: string[];
  removedTrackIds: string[];
};

export function compareCrateTrackIds(
  leftTrackIds: readonly string[],
  rightTrackIds: readonly string[],
): CrateComparison {
  const left = [...new Set(leftTrackIds)];
  const right = [...new Set(rightTrackIds)];
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    common: left.filter((trackId) => rightSet.has(trackId)),
    leftOnly: left.filter((trackId) => !rightSet.has(trackId)),
    rightOnly: right.filter((trackId) => !leftSet.has(trackId)),
  };
}

export function mergeCrateTrackIds(
  targetTrackIds: readonly string[],
  sourceTrackIds: readonly string[],
) {
  const merged = [...new Set(targetTrackIds)];
  const seen = new Set(merged);
  for (const trackId of sourceTrackIds) {
    if (seen.has(trackId)) continue;
    seen.add(trackId);
    merged.push(trackId);
  }
  return merged;
}

function camelotValue(value: string | null) {
  const match = value?.trim().toUpperCase().match(/^(1[0-2]|[1-9])([AB])$/);
  if (!match) return null;
  return Number(match[1]) * 2 + (match[2] === "B" ? 1 : 0);
}

function fieldValue(track: CrateToolTrack, field: CrateToolSortField) {
  if (field === "camelot") return camelotValue(track.camelot_key);
  if (field === "bpm") return track.bpm;
  if (field === "energy") return track.energy;
  return track.rating;
}

export function sortCrateTrackIds(
  currentTrackIds: readonly string[],
  tracks: readonly CrateToolTrack[],
  field: CrateToolSortField,
  direction: CrateToolSortDirection,
) {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const originalPosition = new Map(
    currentTrackIds.map((trackId, index) => [trackId, index]),
  );
  return [...new Set(currentTrackIds)].sort((leftId, rightId) => {
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    const leftValue = left ? fieldValue(left, field) : null;
    const rightValue = right ? fieldValue(right, field) : null;
    if (leftValue === null && rightValue === null) {
      return (originalPosition.get(leftId) ?? 0) - (originalPosition.get(rightId) ?? 0);
    }
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (leftValue !== rightValue) {
      return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
    }
    return (originalPosition.get(leftId) ?? 0) - (originalPosition.get(rightId) ?? 0);
  });
}

export function dedupeCrateByExactFingerprint(
  currentTrackIds: readonly string[],
  tracks: readonly CrateToolTrack[],
): CrateDedupePreview {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const seenTrackIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const keptTrackIds: string[] = [];
  const removedTrackIds: string[] = [];

  for (const trackId of currentTrackIds) {
    if (seenTrackIds.has(trackId)) {
      removedTrackIds.push(trackId);
      continue;
    }
    seenTrackIds.add(trackId);
    const fingerprint = byId.get(trackId)?.file_fingerprint?.trim() || null;
    if (fingerprint && seenFingerprints.has(fingerprint)) {
      removedTrackIds.push(trackId);
      continue;
    }
    if (fingerprint) seenFingerprints.add(fingerprint);
    keptTrackIds.push(trackId);
  }

  return { keptTrackIds, removedTrackIds };
}
