"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  executeMaestBatchApply,
  maestAutomaticClassificationUpdate,
  parseMaestBatchApplyRequest,
  type MaestBatchApplyResult,
  type MaestBatchApplyStore,
} from "@/lib/library/maest-batch-apply";
import { createClient } from "@/lib/supabase/server";

export async function applyMaestBatchProposalsAction(
  input: unknown,
): Promise<MaestBatchApplyResult> {
  let request;
  try {
    request = parseMaestBatchApplyRequest(input);
  } catch {
    return { status: "invalid", items: [] };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const store: MaestBatchApplyStore = {
    async read(trackId) {
      const { data, error } = await supabase
        .from("tracks")
        .select("genre, subgenre")
        .eq("id", trackId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    async compareAndSet(trackId, field, expectedValue, evidence) {
      let query = supabase
        .from("tracks")
        .update(maestAutomaticClassificationUpdate(field, evidence))
        .eq("id", trackId)
        .eq("user_id", user.id);
      query =
        expectedValue === null
          ? query.is(field, null)
          : query.eq(field, expectedValue);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) return "failed";
      return data ? "applied" : "conflict";
    },
  };

  const items = await executeMaestBatchApply(request, store);
  if (items.some((item) => item.status === "applied")) {
    revalidatePath("/library");
  }
  return { status: "ok", items };
}
