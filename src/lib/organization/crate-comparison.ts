import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type CrateComparison = {
  common: string[];
  leftOnly: string[];
  rightOnly: string[];
};

export type BoundedCrateComparison = {
  common: { count: number; trackIds: string[] };
  leftOnly: { count: number; trackIds: string[] };
  rightOnly: { count: number; trackIds: string[] };
};

type CompareCratesRpcRow = {
  relation: "common" | "left_only" | "right_only";
  relation_count: number;
  relation_order: number;
  track_id: string;
};

type CompareCratesRpc = (
  functionName: "compare_crates",
  args: {
    p_left_crate_id: string;
    p_limit_per_relation: number;
    p_right_crate_id: string;
  },
) => Promise<{
  data: CompareCratesRpcRow[] | null;
  error: { message: string } | null;
}>;

export function compareCrateTrackIds(
  leftTrackIds: string[],
  rightTrackIds: string[],
): CrateComparison {
  const left = [...new Set(leftTrackIds)];
  const right = [...new Set(rightTrackIds)];
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return {
    common: left.filter((id) => rightSet.has(id)),
    leftOnly: left.filter((id) => !rightSet.has(id)),
    rightOnly: right.filter((id) => !leftSet.has(id)),
  };
}

export async function compareCrates(
  supabase: SupabaseClient<Database>,
  leftCrateId: string,
  rightCrateId: string,
  limitPerRelation = 200,
): Promise<BoundedCrateComparison> {
  const rpc = supabase.rpc.bind(supabase) as unknown as CompareCratesRpc;
  const { data, error } = await rpc("compare_crates", {
    p_left_crate_id: leftCrateId,
    p_limit_per_relation: Math.min(Math.max(Math.trunc(limitPerRelation), 1), 500),
    p_right_crate_id: rightCrateId,
  });
  if (error) throw new Error("No se pudieron comparar los crates.");

  const comparison: BoundedCrateComparison = {
    common: { count: 0, trackIds: [] },
    leftOnly: { count: 0, trackIds: [] },
    rightOnly: { count: 0, trackIds: [] },
  };

  for (const row of data ?? []) {
    const target =
      row.relation === "common"
        ? comparison.common
        : row.relation === "left_only"
          ? comparison.leftOnly
          : comparison.rightOnly;
    target.count = Number(row.relation_count);
    target.trackIds.push(row.track_id);
  }

  return comparison;
}
