"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  maestAutomaticClassificationUpdate,
  parseMaestBatchApplyRequest,
  parseMaestBatchHistoryResult,
  type MaestBatchApplyFieldStatus,
  type MaestBatchApplyItemResult,
  type MaestBatchApplyRequest,
  type MaestBatchApplyResult,
} from "@/lib/library/maest-batch-apply";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

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

  const { data, error } = await supabase.rpc("apply_maest_batch_with_history", {
    requested_items: requestedItems as Json,
  });

  if (error) {
    return { status: "ok", items: failedItems(request) };
  }
  let result;
  try {
    result = parseMaestBatchHistoryResult(data);
  } catch {
    return { status: "ok", items: failedItems(request) };
  }

  if (
    result.items.some(
      (item) => item.genre === "applied" || item.subgenre === "applied",
    )
  ) {
    revalidatePath("/library");
  }

  return { status: "ok", items: result.items };
}
