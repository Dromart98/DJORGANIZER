import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type TrackEditHistoryEntry = {
  can_undo: boolean;
  changed_fields: string[];
  created_at: string;
  id: string;
  undone_at: string | null;
};

export type BulkTrackEditHistoryBatch = {
  batch_id: string;
  can_undo: boolean;
  created_at: string;
  field_name: string;
  previous_value_count: number;
  previous_values: unknown[];
  track_count: number;
  undone_at: string | null;
};

type ListTrackEditHistoryRpc = (
  functionName: "list_track_edit_history",
  args: {
    requested_limit: number;
    requested_track_id: string;
  },
) => Promise<{
  data: TrackEditHistoryEntry[] | null;
  error: { message?: string } | null;
}>;

type ListBulkTrackEditHistoryRpc = (
  functionName: "list_bulk_track_edit_batches",
  args: { requested_limit: number },
) => Promise<{
  data: BulkTrackEditHistoryBatch[] | null;
  error: { message?: string } | null;
}>;

export async function listTrackEditHistory(
  supabase: SupabaseClient<Database>,
  trackId: string,
  limit = 10,
): Promise<TrackEditHistoryEntry[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ListTrackEditHistoryRpc;
  const { data, error } = await rpc("list_track_edit_history", {
    requested_limit: Math.max(1, Math.min(limit, 50)),
    requested_track_id: trackId,
  });
  if (error) throw new Error("No se pudo cargar el historial de edición.");
  return data ?? [];
}

export async function listBulkTrackEditHistory(
  supabase: SupabaseClient<Database>,
  limit = 10,
): Promise<BulkTrackEditHistoryBatch[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ListBulkTrackEditHistoryRpc;
  const { data, error } = await rpc("list_bulk_track_edit_batches", {
    requested_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) throw new Error("No se pudo cargar el historial de edición masiva.");
  return data ?? [];
}
