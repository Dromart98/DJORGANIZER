import type { TablesInsert } from "@/types/database";

const TRACK_RESTORE_KEYS = [
  "acoustic_fingerprint",
  "album",
  "analysis_status",
  "artist",
  "artwork_url",
  "bpm",
  "bpm_confidence",
  "bpm_explanation",
  "bpm_source",
  "camelot_key",
  "comments",
  "created_at",
  "duration_seconds",
  "energy",
  "energy_confidence",
  "energy_source",
  "file_fingerprint",
  "file_name",
  "file_size",
  "file_type",
  "genre",
  "genre_analyzed_at_ms",
  "genre_analyzer_id",
  "genre_analyzer_version",
  "genre_compatibility_key",
  "genre_confidence",
  "genre_raw_score",
  "genre_source",
  "subgenre",
  "subgenre_analyzed_at_ms",
  "subgenre_analyzer_id",
  "subgenre_analyzer_version",
  "subgenre_compatibility_key",
  "subgenre_confidence",
  "subgenre_raw_score",
  "subgenre_source",
  "id",
  "key_confidence",
  "key_explanation",
  "key_source",
  "musical_key",
  "rating",
  "release_year",
  "title",
  "updated_at",
  "version_type",
] as const;

const MAEST_EVIDENCE_KEYS = [
  "genre_analyzed_at_ms",
  "genre_analyzer_id",
  "genre_analyzer_version",
  "genre_compatibility_key",
  "genre_raw_score",
  "subgenre_analyzed_at_ms",
  "subgenre_analyzer_id",
  "subgenre_analyzer_version",
  "subgenre_compatibility_key",
  "subgenre_raw_score",
] as const;

export function trackRowsForRestore(
  rows: readonly Record<string, unknown>[],
  userId: string,
): TablesInsert<"tracks">[] {
  return rows.map((row) => {
    const restored: Record<string, unknown> = { user_id: userId };
    for (const key of TRACK_RESTORE_KEYS) {
      if (key in row) restored[key] = row[key];
    }
    for (const key of MAEST_EVIDENCE_KEYS) {
      restored[key] ??= null;
    }
    return restored as TablesInsert<"tracks">;
  });
}
