import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TrackArchiveHistoryEntry = {
  can_undo: boolean;
  created_at: string;
  id: string;
  operation: "archive" | "restore";
  track_id: string;
  track_title: string;
  undone_at: string | null;
};

type ListTrackArchiveHistoryRpc = (
  functionName: "list_track_archive_history",
  args: { requested_limit: number },
) => Promise<{
  data: TrackArchiveHistoryEntry[] | null;
  error: { message?: string } | null;
}>;

export async function listTrackArchiveHistory(
  supabase: SupabaseClient<Database>,
  limit = 10,
): Promise<TrackArchiveHistoryEntry[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ListTrackArchiveHistoryRpc;
  const { data, error } = await rpc("list_track_archive_history", {
    requested_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) throw new Error("No se pudo cargar el historial de archivado.");
  return data ?? [];
}
