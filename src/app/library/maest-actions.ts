"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  maestAutomaticClassificationUpdate,
  parseMaestBatchApplyRequest,
  type MaestBatchApplyFieldStatus,
  type MaestBatchApplyItemResult,
  type MaestBatchApplyRequest,
  type MaestBatchApplyResult,
} from "@/lib/library/maest-batch-apply";
import { createClient } from "@/lib/supabase/server";

type ApplyMaestBatchWithHistoryRpc = (
  functionName: "apply_maest_batch_with_history",
  args: { requested_items: unknown[] },
) => Promise<{
  data:
    | {
        batch_id: string | null;
        changed_count: number;
        items: MaestBatchApplyItemResult[];
      }
    | null;
  error: { message?: string } | null;
}>;

function failedItems(request: MaestBatchApplyRequest): MaestBatchApplyItemResult[] {
  return request.items.map((item) => {
    const genre: MaestBatchApplyFieldStatus = item.genre ? "failed" : "omitted";
    const subgenre: MaestBatchApplyFieldStatus = item.subgenre ? "failed" : "omitted";
    return {
      trackId: item.trackId,
      genre,
      subgenre,
      status: "failed",
    };
  });
}

export async function applyMaestBatchProposalsAction(
  input: unknown,
): Promise<MaestBatchApplyResult> {
  let request;
  try {
    request = parseMaestBatchApplyRequest(input);
  } catch {
    return { status: "invalid", items: [] };
  }

  await requireUser();
  const supabase = await createClient();
  const requestedItems = request.items.map((item) => ({
    track_id: item.trackId,
    ...(item.genre
      ? {
          genre: {
            expected_value: item.genre.expectedValue,
            patch: maestAutomaticClassificationUpdate("genre", item.genre.evidence),
          },
        }
      : {}),
    ...(item.subgenre
      ? {
          subgenre: {
            expected_value: item.subgenre.expectedValue,
            patch: maestAutomaticClassificationUpdate(
              "subgenre",
              item.subgenre.evidence,
            ),
          },
        }
      : {}),
  }));

  const rpc = supabase.rpc.bind(supabase) as unknown as ApplyMaestBatchWithHistoryRpc;
  const { data, error } = await rpc("apply_maest_batch_with_history", {
    requested_items: requestedItems,
  });

  if (error || !data || !Array.isArray(data.items)) {
    return { status: "ok", items: failedItems(request) };
  }

  if (
    data.items.some(
      (item) => item.genre === "applied" || item.subgenre === "applied",
    )
  ) {
    revalidatePath("/library");
  }

  return { status: "ok", items: data.items };
}
