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

  const { data: crate, error: crateError } = await supabase
    .from("crates")
    .insert({
      description: null,
      name: parsed.data.name,
      parent_id: null,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (crateError?.code === "23505") return { status: "duplicate" };
  if (crateError || !crate) return { status: "failed" };

  const { error: membershipError } = await supabase.from("crate_tracks").insert(
    trackIds.map((trackId, position) => ({
      crate_id: crate.id,
      position,
      track_id: trackId,
      user_id: user.id,
    })),
  );

  if (membershipError) {
    await supabase
      .from("crates")
      .delete()
      .eq("id", crate.id)
      .eq("user_id", user.id);
    return { status: "failed" };
  }

  revalidatePath("/crates");
  revalidatePath(`/crates/${crate.id}`);
  return { status: "created", crateId: crate.id };
}
