"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

const historyIdSchema = z.string().uuid();

type UndoTrackTagHistoryRpc = (
  functionName: "undo_track_tag_history",
  args: { requested_history_id: string },
) => Promise<{
  data:
    | {
        history_id: string;
        restored_count: number;
        tag_id: string;
        track_ids: string[];
      }
    | null;
  error: { message?: string } | null;
}>;

function withStatus(path: string, key: string, value = "1") {
  const url = new URL(path, "https://djorganizer.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function undoTrackTagHistoryAction(formData: FormData) {
  await requireUser();
  const historyId = historyIdSchema.safeParse(formData.get("historyId"));
  const returnTo = safeRedirectPath(formData.get("returnTo"));
  if (!historyId.success) {
    redirect(withStatus(returnTo, "tagUndoError"));
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UndoTrackTagHistoryRpc;
  const { data, error } = await rpc("undo_track_tag_history", {
    requested_history_id: historyId.data,
  });

  if (error || !data) {
    const message = error?.message ?? "";
    const reason =
      message.includes("changed after") || message.includes("changed while")
        ? "changed"
        : "failed";
    redirect(withStatus(withStatus(returnTo, "tagUndoError"), "tagUndoReason", reason));
  }

  revalidatePath("/library");
  revalidatePath("/crates");
  for (const trackId of data.track_ids) {
    revalidatePath(`/library/${trackId}`);
  }
  redirect(withStatus(returnTo, "tagUndone"));
}
