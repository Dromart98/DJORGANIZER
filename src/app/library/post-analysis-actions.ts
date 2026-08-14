"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import {
  crateValuesSchema,
  organizationIdSchema,
} from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

const createPostAnalysisCrateSchema = z.object({
  name: crateValuesSchema.shape.name,
  trackIds: z.array(organizationIdSchema).min(1).max(25),
});

export type CreatePostAnalysisCrateResult =
  | { status: "created"; crateId: string }
  | { status: "duplicate" | "invalid" | "failed" };

export async function createPostAnalysisCrateAction(
  input: unknown,
): Promise<CreatePostAnalysisCrateResult> {
  const parsed = createPostAnalysisCrateSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };

  const user = await requireUser();
  const trackIds = [...new Set(parsed.data.trackIds)];
  const supabase = await createClient();
  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select("id")
    .eq("user_id", user.id)
    .in("id", trackIds);

  if (tracksError || (tracks ?? []).length !== trackIds.length) {
    return { status: "invalid" };
  }

  const { data: crateId, error } = await supabase.rpc(
    "create_post_analysis_crate",
    {
      crate_name: parsed.data.name,
      track_ids: trackIds,
    },
  );

  if (error?.code === "23505") return { status: "duplicate" };
  if (error || !crateId) return { status: "failed" };

  revalidatePath("/crates");
  revalidatePath(`/crates/${crateId}`);
  return { status: "created", crateId };
}
