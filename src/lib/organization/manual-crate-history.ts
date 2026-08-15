import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ManualCrateHistoryEntry = {
  after_count: number;
  before_count: number;
  can_undo: boolean;
  change_kind: "add" | "merge" | "move" | "reconcile" | "remove" | "sort";
  created_at: string;
  id: string;
  undone_at: string | null;
};

type ListManualCrateHistoryRpc = (
  functionName: "list_manual_crate_history",
  args: {
    requested_crate_id: string;
    requested_limit: number;
  },
) => Promise<{
  data: ManualCrateHistoryEntry[] | null;
  error: { message?: string } | null;
}>;

export async function listManualCrateHistory(
  supabase: SupabaseClient<Database>,
  crateId: string,
  limit = 10,
): Promise<ManualCrateHistoryEntry[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ListManualCrateHistoryRpc;
  const { data, error } = await rpc("list_manual_crate_history", {
    requested_crate_id: crateId,
    requested_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) throw new Error("No se pudo cargar el historial del crate.");
  return data ?? [];
}
