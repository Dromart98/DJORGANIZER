"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

const historyIdSchema = z.string().uuid();
const crateIdSchema = z.string().uuid();

type UndoManualCrateHistoryRpc = (
  functionName: "undo_manual_crate_history",
  args: { requested_history_id: string },
) => Promise<{
  data:
    | {
        crate_id: string;
        history_id: string;
        restored_count: number;
      }
    | null;
  error: { message?: string } | null;
}>;

function withStatus(crateId: string, key: string, value = "1") {
  const params = new URLSearchParams({ [key]: value });
  return `/crates/${crateId}?${params.toString()}`;
}

export async function undoManualCrateHistoryAction(formData: FormData) {
  await requireUser();
  const historyId = historyIdSchema.safeParse(formData.get("historyId"));
  const crateId = crateIdSchema.safeParse(formData.get("crateId"));
  if (!historyId.success || !crateId.success) {
    redirect("/crates?error=invalid-crate");
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UndoManualCrateHistoryRpc;
  const { data, error } = await rpc("undo_manual_crate_history", {
    requested_history_id: historyId.data,
  });

  if (error || !data || data.crate_id !== crateId.data) {
    const message = error?.message ?? "";
    const reason =
      message.includes("superseded") ||
      message.includes("changed after") ||
      message.includes("no longer available") ||
      message.includes("not found")
        ? "changed"
        : "failed";
    redirect(withStatus(crateId.data, "historyUndoError", reason));
  }

  revalidatePath("/crates");
  revalidatePath(`/crates/${crateId.data}`);
  revalidatePath(`/crates/${crateId.data}/sort`);
  revalidatePath("/crates/compare");
  revalidatePath("/crates/merge");
  redirect(withStatus(crateId.data, "historyUndone"));
}
