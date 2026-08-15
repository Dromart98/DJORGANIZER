"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import {
  resolveComparableCrateTrackIds,
  type ComparableCrate,
} from "@/lib/organization/crate-comparison";
import { crateOrderDigest } from "@/lib/organization/crate-merge";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);

type MergeRpc = (
  functionName: "merge_manual_crates",
  args: {
    expected_source_track_ids: string[];
    expected_target_track_ids: string[];
    source_crate_id: string;
    target_crate_id: string;
  },
) => Promise<{
  data: unknown;
  error: { message?: string } | null;
}>;

function mergeError(reason: string): never {
  redirect(`/crates/merge?error=${encodeURIComponent(reason)}`);
}

export async function mergeManualCratesAction(formData: FormData) {
  const user = await requireUser();
  const sourceId = organizationIdSchema.safeParse(formData.get("sourceId"));
  const targetId = organizationIdSchema.safeParse(formData.get("targetId"));
  const sourceDigest = digestSchema.safeParse(formData.get("sourceDigest"));
  const targetDigest = digestSchema.safeParse(formData.get("targetDigest"));

  if (
    !sourceId.success ||
    !targetId.success ||
    sourceId.data === targetId.data ||
    !sourceDigest.success ||
    !targetDigest.success
  ) {
    mergeError("invalid");
  }

  const supabase = await createClient();
  const { data: crates, error: cratesError } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("user_id", user.id)
    .in("id", [sourceId.data, targetId.data]);
  if (cratesError || (crates ?? []).length !== 2) mergeError("invalid");

  const byId = new Map(
    ((crates ?? []) as ComparableCrate[]).map((crate) => [crate.id, crate]),
  );
  const source = byId.get(sourceId.data);
  const target = byId.get(targetId.data);
  if (!source || !target || source.smart_rules !== null || target.smart_rules !== null) {
    mergeError("manual-only");
  }

  const [sourceTrackIds, targetTrackIds] = await Promise.all([
    resolveComparableCrateTrackIds(supabase, user.id, source),
    resolveComparableCrateTrackIds(supabase, user.id, target),
  ]);
  if (
    crateOrderDigest(sourceTrackIds) !== sourceDigest.data ||
    crateOrderDigest(targetTrackIds) !== targetDigest.data
  ) {
    mergeError("changed");
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as MergeRpc;
  const { error } = await rpc("merge_manual_crates", {
    expected_source_track_ids: sourceTrackIds,
    expected_target_track_ids: targetTrackIds,
    source_crate_id: source.id,
    target_crate_id: target.id,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("changed after preview")) mergeError("changed");
    if (message.includes("20000") || message.includes("Too many tracks")) {
      mergeError("limit");
    }
    mergeError("save");
  }

  revalidatePath("/crates");
  revalidatePath(`/crates/${source.id}`);
  revalidatePath(`/crates/${target.id}`);
  revalidatePath("/crates/compare");
  revalidatePath("/crates/merge");
  redirect(`/crates/merge?merged=1&target=${target.id}`);
}
