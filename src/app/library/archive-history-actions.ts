"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

const historyIdSchema = z.string().uuid();

type UndoTrackArchiveHistoryRpc = (
  functionName: "undo_track_archive_history",
  args: { requested_history_id: string },
) => Promise<{
  data:
    | {
        history_id: string;
        restored_archived_at: string | null;
        track_id: string;
      }
    | null;
  error: { message?: string } | null;
}>;

function withStatus(path: string, key: string, value = "1") {
  const url = new URL(path, "https://djorganizer.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function undoTrackArchiveHistoryAction(formData: FormData) {
  await requireUser();
  const historyId = historyIdSchema.safeParse(formData.get("historyId"));
  const returnTo = safeRedirectPath(formData.get("returnTo"));
  if (!historyId.success) {
    redirect(withStatus(returnTo, "archiveUndoError"));
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UndoTrackArchiveHistoryRpc;
  const { data, error } = await rpc("undo_track_archive_history", {
    requested_history_id: historyId.data,
  });

  if (error || !data) {
    const message = error?.message ?? "";
    const reason =
      message.includes("superseded") ||
      message.includes("state changed") ||
      message.includes("Track not found")
        ? "changed"
        : "failed";
    redirect(
      withStatus(
        withStatus(returnTo, "archiveUndoError"),
        "archiveUndoReason",
        reason,
      ),
    );
  }

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath(`/library/${data.track_id}`);
  revalidatePath("/crates");
  redirect(withStatus(returnTo, "archiveUndone"));
}
