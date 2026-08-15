"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import {
  dedupeCrateByExactFingerprint,
  mergeCrateTrackIds,
  sortCrateTrackIds,
  type CrateToolSortDirection,
  type CrateToolSortField,
  type CrateToolTrack,
} from "@/lib/organization/crate-tools";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sortFieldSchema = z.enum(["bpm", "camelot", "energy", "rating"]);
const sortDirectionSchema = z.enum(["asc", "desc"]);
const PAGE_SIZE = 500;

function orderDigest(trackIds: readonly string[]) {
  return createHash("sha256").update(trackIds.join("\n")).digest("hex");
}

function toolsError(reason: string): never {
  redirect(`/crates/tools?error=${encodeURIComponent(reason)}`);
}

async function loadManualCrateSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  crateId: string,
) {
  const { data: crate, error: crateError } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("id", crateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (crateError || !crate || crate.smart_rules !== null) toolsError("invalid-crate");

  const trackIds: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("crate_tracks")
      .select("track_id")
      .eq("crate_id", crate.id)
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("track_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) toolsError("load-crate");
    const rows = data ?? [];
    trackIds.push(...rows.map((row) => row.track_id));
    if (rows.length < PAGE_SIZE) break;
  }
  return { id: crate.id, name: crate.name, trackIds };
}

async function loadTracks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  trackIds: readonly string[],
) {
  const tracks: CrateToolTrack[] = [];
  const uniqueIds = [...new Set(trackIds)];
  for (let index = 0; index < uniqueIds.length; index += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, artist, bpm, camelot_key, energy, rating, file_fingerprint")
      .eq("user_id", userId)
      .in("id", uniqueIds.slice(index, index + PAGE_SIZE));
    if (error) toolsError("load-tracks");
    tracks.push(...(data ?? []));
  }
  return tracks;
}

async function reconcileCrate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  crateId: string,
  desiredTrackIds: string[],
) {
  const { error } = await supabase.rpc("reconcile_crate_tracks", {
    desired_track_ids: desiredTrackIds,
    remove_missing: true,
    target_crate_id: crateId,
  });
  if (error) toolsError("save-crate");
  revalidatePath("/crates");
  revalidatePath(`/crates/${crateId}`);
  revalidatePath("/crates/tools");
}

export async function mergeCratesAction(formData: FormData) {
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
    toolsError("invalid-merge");
  }

  const supabase = await createClient();
  const [source, target] = await Promise.all([
    loadManualCrateSnapshot(supabase, user.id, sourceId.data),
    loadManualCrateSnapshot(supabase, user.id, targetId.data),
  ]);
  if (
    orderDigest(source.trackIds) !== sourceDigest.data ||
    orderDigest(target.trackIds) !== targetDigest.data
  ) {
    toolsError("changed");
  }

  const desiredTrackIds = mergeCrateTrackIds(target.trackIds, source.trackIds);
  await reconcileCrate(supabase, target.id, desiredTrackIds);
  redirect(`/crates/tools?merged=1&target=${target.id}`);
}

export async function sortCrateAction(formData: FormData) {
  const user = await requireUser();
  const crateId = organizationIdSchema.safeParse(formData.get("crateId"));
  const digest = digestSchema.safeParse(formData.get("digest"));
  const field = sortFieldSchema.safeParse(formData.get("field"));
  const direction = sortDirectionSchema.safeParse(formData.get("direction"));
  if (!crateId.success || !digest.success || !field.success || !direction.success) {
    toolsError("invalid-sort");
  }

  const supabase = await createClient();
  const snapshot = await loadManualCrateSnapshot(supabase, user.id, crateId.data);
  if (orderDigest(snapshot.trackIds) !== digest.data) toolsError("changed");
  const tracks = await loadTracks(supabase, user.id, snapshot.trackIds);
  const desiredTrackIds = sortCrateTrackIds(
    snapshot.trackIds,
    tracks,
    field.data as CrateToolSortField,
    direction.data as CrateToolSortDirection,
  );
  await reconcileCrate(supabase, snapshot.id, desiredTrackIds);
  redirect(`/crates/tools?sorted=1&target=${snapshot.id}`);
}

export async function dedupeCrateAction(formData: FormData) {
  const user = await requireUser();
  const crateId = organizationIdSchema.safeParse(formData.get("crateId"));
  const digest = digestSchema.safeParse(formData.get("digest"));
  if (!crateId.success || !digest.success) toolsError("invalid-dedupe");

  const supabase = await createClient();
  const snapshot = await loadManualCrateSnapshot(supabase, user.id, crateId.data);
  if (orderDigest(snapshot.trackIds) !== digest.data) toolsError("changed");
  const tracks = await loadTracks(supabase, user.id, snapshot.trackIds);
  const preview = dedupeCrateByExactFingerprint(snapshot.trackIds, tracks);
  if (!preview.removedTrackIds.length) {
    redirect(`/crates/tools?deduped=0&target=${snapshot.id}`);
  }
  await reconcileCrate(supabase, snapshot.id, preview.keptTrackIds);
  redirect(
    `/crates/tools?deduped=${preview.removedTrackIds.length}&target=${snapshot.id}`,
  );
}
