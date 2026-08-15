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
import {
  crateSortDirections,
  crateSortKeys,
  loadCrateSortTracks,
  sortCrateTracks,
} from "@/lib/organization/crate-sort";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

const MAX_SORT_TRACKS = 20_000;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sortKeySchema = z.enum(crateSortKeys);
const sortDirectionSchema = z.enum(crateSortDirections);

type ApplyOrderRpc = (
  functionName: "apply_manual_crate_order",
  args: {
    expected_track_ids: string[];
    requested_crate_id: string;
    requested_track_ids: string[];
  },
) => Promise<{
  data: unknown;
  error: { message?: string } | null;
}>;

function sortError(crateId: string, reason: string): never {
  redirect(`/crates/${crateId}/sort?error=${encodeURIComponent(reason)}`);
}

export async function sortManualCrateAction(formData: FormData) {
  const user = await requireUser();
  const crateId = organizationIdSchema.safeParse(formData.get("crateId"));
  const sortKey = sortKeySchema.safeParse(formData.get("sortKey"));
  const direction = sortDirectionSchema.safeParse(formData.get("direction"));
  const currentDigest = digestSchema.safeParse(formData.get("currentDigest"));
  const sortedDigest = digestSchema.safeParse(formData.get("sortedDigest"));

  if (
    !crateId.success ||
    !sortKey.success ||
    !direction.success ||
    !currentDigest.success ||
    !sortedDigest.success
  ) {
    redirect("/crates?error=invalid-crate");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("id", crateId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) sortError(crateId.data, "invalid");

  const crate = data as ComparableCrate;
  if (crate.smart_rules !== null) sortError(crate.id, "manual-only");

  const { count: membershipCount, error: countError } = await supabase
    .from("crate_tracks")
    .select("track_id", { count: "exact", head: true })
    .eq("crate_id", crate.id)
    .eq("user_id", user.id);
  if (countError) sortError(crate.id, "save");
  if ((membershipCount ?? 0) > MAX_SORT_TRACKS) sortError(crate.id, "limit");

  const currentTrackIds = await resolveComparableCrateTrackIds(
    supabase,
    user.id,
    crate,
  );
  if (crateOrderDigest(currentTrackIds) !== currentDigest.data) {
    sortError(crate.id, "changed");
  }

  const currentTracks = await loadCrateSortTracks(
    supabase,
    user.id,
    currentTrackIds,
  );
  const sortedTracks = sortCrateTracks(
    currentTracks,
    sortKey.data,
    direction.data,
  );
  const sortedTrackIds = sortedTracks.map(({ id }) => id);
  if (crateOrderDigest(sortedTrackIds) !== sortedDigest.data) {
    sortError(crate.id, "changed");
  }

  const rpc = supabase.rpc.bind(supabase) as unknown as ApplyOrderRpc;
  const { error: applyError } = await rpc("apply_manual_crate_order", {
    expected_track_ids: currentTrackIds,
    requested_crate_id: crate.id,
    requested_track_ids: sortedTrackIds,
  });
  if (applyError) {
    const message = applyError.message ?? "";
    if (message.includes("changed after preview")) sortError(crate.id, "changed");
    if (message.includes("20000") || message.includes("Too many tracks")) {
      sortError(crate.id, "limit");
    }
    sortError(crate.id, "save");
  }

  revalidatePath("/crates");
  revalidatePath(`/crates/${crate.id}`);
  revalidatePath(`/crates/${crate.id}/sort`);
  revalidatePath("/crates/compare");
  revalidatePath("/crates/merge");
  redirect(
    `/crates/${crate.id}/sort?sorted=1&key=${sortKey.data}&direction=${direction.data}`,
  );
}
