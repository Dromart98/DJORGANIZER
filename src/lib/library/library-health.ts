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

async function countTracks(
  supabase: SupabaseClient<Database>,
  userId: string,
  apply: (
    query: ReturnType<SupabaseClient<Database>["from"]> extends never
      ? never
      : any,
  ) => any,
) {
  const base = supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count, error } = await apply(base);
  if (error) throw new Error("No se pudo calcular la salud de la biblioteca.");
  return count ?? 0;
}

export async function getLibraryHealth(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<LibraryHealthSummary> {
  const [
    total,
    missingBpm,
    missingKey,
    missingGenre,
    missingDuration,
    missingFileIdentity,
    needsAnalysis,
    needsAnalysisRows,
  ] = await Promise.all([
    countTracks(supabase, userId, (query) => query),
    countTracks(supabase, userId, (query) => query.is("bpm", null)),
    countTracks(supabase, userId, (query) => query.is("musical_key", null)),
    countTracks(supabase, userId, (query) => query.is("genre", null)),
    countTracks(supabase, userId, (query) => query.is("duration_seconds", null)),
    countTracks(supabase, userId, (query) =>
      query.or("file_fingerprint.is.null,file_size.is.null"),
    ),
    countTracks(supabase, userId, (query) =>
      query.or("bpm.is.null,musical_key.is.null"),
    ),
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
    missingBpm,
    missingDuration,
    missingFileIdentity,
    missingGenre,
    missingKey,
    needsAnalysis,
    needsAnalysisTracks: (needsAnalysisRows.data ?? []).map((track) => ({
      artist: track.artist,
      bpm: track.bpm,
      id: track.id,
      musicalKey: track.musical_key,
      title: track.title,
    })),
    total,
  };
}
