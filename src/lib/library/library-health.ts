import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type LibraryHealthTrack = {
  artist: string | null;
  bpm: number | null;
  id: string;
  musicalKey: string | null;
  title: string;
};

export type LibraryHealthSummary = {
  missingBpm: number;
  missingDuration: number;
  missingFileIdentity: number;
  missingGenre: number;
  missingKey: number;
  needsAnalysis: number;
  needsAnalysisTracks: LibraryHealthTrack[];
  total: number;
};

function countOrThrow(
  result: { count: number | null; error: { message: string } | null },
) {
  if (result.error) throw new Error("No se pudo calcular la salud de la biblioteca.");
  return result.count ?? 0;
}

export async function getLibraryHealth(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LibraryHealthSummary> {
  const baseCount = () =>
    supabase
      .from("tracks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

  const [
    totalResult,
    missingBpmResult,
    missingKeyResult,
    missingGenreResult,
    missingDurationResult,
    missingFileIdentityResult,
    needsAnalysisResult,
    needsAnalysisRows,
  ] = await Promise.all([
    baseCount(),
    baseCount().is("bpm", null),
    baseCount().is("musical_key", null),
    baseCount().is("genre", null),
    baseCount().is("duration_seconds", null),
    baseCount().or("file_fingerprint.is.null,file_size.is.null"),
    baseCount().or("bpm.is.null,musical_key.is.null"),
    supabase
      .from("tracks")
      .select("id, title, artist, bpm, musical_key")
      .eq("user_id", userId)
      .or("bpm.is.null,musical_key.is.null")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(25),
  ]);

  if (needsAnalysisRows.error) {
    throw new Error("No se pudieron cargar las pistas pendientes de análisis.");
  }

  return {
    missingBpm: countOrThrow(missingBpmResult),
    missingDuration: countOrThrow(missingDurationResult),
    missingFileIdentity: countOrThrow(missingFileIdentityResult),
    missingGenre: countOrThrow(missingGenreResult),
    missingKey: countOrThrow(missingKeyResult),
    needsAnalysis: countOrThrow(needsAnalysisResult),
    needsAnalysisTracks: (needsAnalysisRows.data ?? []).map((track) => ({
      artist: track.artist,
      bpm: track.bpm,
      id: track.id,
      musicalKey: track.musical_key,
      title: track.title,
    })),
    total: countOrThrow(totalResult),
  };
}
