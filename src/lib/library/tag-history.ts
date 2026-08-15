import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TrackTagHistoryEntry = {
  can_undo: boolean;
  created_at: string;
  id: string;
  operation: "add" | "remove";
  tag_name: string;
  track_count: number;
  undone_at: string | null;
};

type ListTrackTagHistoryRpc = (
  functionName: "list_track_tag_history",
  args: { requested_limit: number },
) => Promise<{
  data: TrackTagHistoryEntry[] | null;
  error: { message?: string } | null;
}>;

export async function listTrackTagHistory(
  supabase: SupabaseClient<Database>,
  limit = 10,
): Promise<TrackTagHistoryEntry[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ListTrackTagHistoryRpc;
  const { data, error } = await rpc("list_track_tag_history", {
    requested_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) throw new Error("No se pudo cargar el historial de etiquetas.");
  return data ?? [];
}
