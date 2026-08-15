"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { requireUser } from "@/lib/auth/user";
import {
  crateValuesFromFormData,
  moveTrackSchema,
  organizationIdSchema,
  tagAssignmentSchema,
  tagNameSchema,
  trackAssignmentSchema,
} from "@/lib/organization/schemas";
import {
  parseSmartCrateRulesJson,
  resolveSmartCrateTracks,
  SMART_CRATE_PREVIEW_LIMIT,
  smartCrateRulesToJson,
} from "@/lib/organization/smart-crates";
import { createClient } from "@/lib/supabase/server";

type CrateMutationRpc = (
  functionName: "add_track_to_manual_crate" | "move_track_in_manual_crate",
  args: Record<string, string>,
) => Promise<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

function statusPath(path: string, key: string) {
  const url = new URL(path, "https://djorganizer.local");
  url.searchParams.set(key, "1");
  return `${url.pathname}${url.search}`;
}

function cratesError(reason: string): never {
  redirect(`/crates?error=${reason}`);
}

async function validateParentCrate(
  parentId: string | null,
  userId: string,
  currentId?: string,
) {
  if (!parentId) return true;
  if (parentId === currentId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("crates")
    .select("id, parent_id")
    .eq("user_id", userId)
    .limit(1000);
  const byId = new Map((data ?? []).map((crate) => [crate.id, crate.parent_id]));
  if (!byId.has(parentId)) return false;
  const visited = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === currentId || visited.has(cursor)) return false;
    visited.add(cursor);
    cursor = byId.get(cursor) ?? null;
  }
  return true;
}

export async function createCrateAction(formData: FormData) {
  const user = await requireUser();
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  if (!parsed) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id))) {
    cratesError("invalid-crate");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .insert({ ...parsed, user_id: user.id })
    .select("id")
    .single();

  if (error?.code === "23505") cratesError("duplicate-crate");
  if (error || !data) cratesError("save-crate");

  revalidatePath("/crates");
  redirect(`/crates/${data.id}?created=1`);
}

export async function updateCrateAction(formData: FormData) {
  const user = await requireUser();
  const id = organizationIdSchema.safeParse(formData.get("id"));
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  if (!id.success || !parsed) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id, id.data))) {
    redirect(`/crates/${id.data}?error=invalid-crate`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .update(parsed)
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/crates/${id.data}?error=duplicate-crate`);
  }
  if (error || !data) redirect(`/crates/${id.data}?error=save-crate`);

  revalidatePath("/crates");
  revalidatePath(`/crates/${id.data}`);
  redirect(`/crates/${id.data}?updated=1`);
}

export async function previewSmartCrateAction(serializedRules: string) {
  await requireUser();
  const parsedRules = parseSmartCrateRulesJson(serializedRules);
  if (!parsedRules.success) return { count: 0, tracks: [] };

  try {
    const supabase = await createClient();
    const resolved = await resolveSmartCrateTracks(supabase, parsedRules.data, {
      limit: SMART_CRATE_PREVIEW_LIMIT,
    });
    return {
      count: resolved.count,
      tracks: resolved.tracks.map(({ artist, id, title }) => ({ artist, id, title })),
    };
  } catch {
    return { count: 0, tracks: [] };
  }
}

export async function createSmartCrateAction(formData: FormData) {
  const user = await requireUser();
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  const parsedRules = parseSmartCrateRulesJson(String(formData.get("smartRules") ?? ""));
  if (!parsed || !parsedRules.success) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id))) {
    cratesError("invalid-crate");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .insert({
      ...parsed,
      smart_rules: smartCrateRulesToJson(parsedRules.data),
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") cratesError("duplicate-crate");
  if (error || !data) cratesError("save-crate");

  revalidatePath("/crates");
  redirect(`/crates/${data.id}?created=1`);
}

export async function updateSmartCrateAction(formData: FormData) {
  const user = await requireUser();
  const id = organizationIdSchema.safeParse(formData.get("id"));
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  const parsedRules = parseSmartCrateRulesJson(String(formData.get("smartRules") ?? ""));
  if (!id.success || !parsed || !parsedRules.success) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id, id.data))) {
    redirect(`/crates/${id.data}?error=invalid-crate`);
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing || existing.smart_rules === null) {
    redirect(`/crates/${id.data}?error=invalid-crate`);
  }

  const { data, error } = await supabase
    .from("crates")
    .update({
      ...parsed,
      smart_rules: smartCrateRulesToJson(parsedRules.data),
    })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/crates/${id.data}?error=duplicate-crate`);
  }
  if (error || !data) redirect(`/crates/${id.data}?error=save-crate`);

  revalidatePath("/crates");
  revalidatePath(`/crates/${id.data}`);
  redirect(`/crates/${id.data}?updated=1`);
}

export async function deleteCrateAction(formData: FormData) {
  const user = await requireUser();
  const id = organizationIdSchema.parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("crates")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) redirect(`/crates/${id}?error=delete-crate`);
  revalidatePath("/crates");
  redirect("/crates?crateDeleted=1");
}

export async function createTagAction(formData: FormData) {
  const user = await requireUser();
  const name = tagNameSchema.safeParse(formData.get("name"));
  if (!name.success) cratesError("invalid-tag");

  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .insert({ name: name.data, user_id: user.id });

  if (error?.code === "23505") cratesError("duplicate-tag");
  if (error) cratesError("save-tag");

  revalidatePath("/crates");
  revalidatePath("/library");
  redirect("/crates?tagCreated=1");
}

export async function deleteTagAction(formData: FormData) {
  const user = await requireUser();
  const id = organizationIdSchema.parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) cratesError("delete-tag");
  revalidatePath("/crates");
  revalidatePath("/library");
  redirect("/crates?tagDeleted=1");
}

async function changeTagAssignment(
  formData: FormData,
  operation: "add" | "remove",
) {
  const user = await requireUser();
  const parsed = tagAssignmentSchema.safeParse({
    tagId: formData.get("tagId"),
    trackIds: formData.getAll("trackId"),
  });
  const returnTo = safeRedirectPath(formData.get("returnTo"));
  if (!parsed.success) redirect(statusPath(returnTo, "tagError"));

  const supabase = await createClient();
  const uniqueTrackIds = [...new Set(parsed.data.trackIds)];
  const [{ data: tag }, { data: tracks, error: tracksError }] =
    await Promise.all([
      supabase
        .from("tags")
        .select("id")
        .eq("id", parsed.data.tagId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("tracks")
        .select("id")
        .eq("user_id", user.id)
        .in("id", uniqueTrackIds),
    ]);

  if (
    !tag ||
    tracksError ||
    (tracks ?? []).length !== uniqueTrackIds.length
  ) {
    redirect(statusPath(returnTo, "tagError"));
  }

  const { error } =
    operation === "add"
      ? await supabase.from("track_tags").upsert(
          uniqueTrackIds.map((trackId) => ({
            tag_id: parsed.data.tagId,
            track_id: trackId,
            user_id: user.id,
          })),
          { ignoreDuplicates: true, onConflict: "track_id,tag_id" },
        )
      : await supabase
          .from("track_tags")
          .delete()
          .eq("user_id", user.id)
          .eq("tag_id", parsed.data.tagId)
          .in("track_id", uniqueTrackIds);

  if (error) redirect(statusPath(returnTo, "tagError"));
  revalidatePath("/library");
  uniqueTrackIds.forEach((trackId) => revalidatePath(`/library/${trackId}`));
  revalidatePath("/crates");
  redirect(statusPath(returnTo, operation === "add" ? "tagged" : "untagged"));
}

export async function assignTagToTracksAction(formData: FormData) {
  return changeTagAssignment(formData, "add");
}

export async function removeTagFromTracksAction(formData: FormData) {
  return changeTagAssignment(formData, "remove");
}

export async function addTrackToCrateAction(formData: FormData) {
  await requireUser();
  const parsed = trackAssignmentSchema.safeParse({
    crateId: formData.get("crateId"),
    trackId: formData.get("trackId"),
  });
  if (!parsed.success) cratesError("invalid-assignment");

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as CrateMutationRpc;
  const { error } = await rpc("add_track_to_manual_crate", {
    requested_crate_id: parsed.data.crateId,
    requested_track_id: parsed.data.trackId,
  });

  if (error?.message?.includes("already in crate")) {
    redirect(`/crates/${parsed.data.crateId}?error=duplicate-track`);
  }
  if (error) redirect(`/crates/${parsed.data.crateId}?error=add-track`);

  revalidatePath("/crates");
  revalidatePath(`/crates/${parsed.data.crateId}`);
  redirect(`/crates/${parsed.data.crateId}?trackAdded=1`);
}

export async function removeTrackFromCrateAction(formData: FormData) {
  const user = await requireUser();
  const parsed = trackAssignmentSchema.parse({
    crateId: formData.get("crateId"),
    trackId: formData.get("trackId"),
  });
  const supabase = await createClient();
  const { data: crate } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", parsed.crateId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!crate || crate.smart_rules !== null) {
    redirect(`/crates/${parsed.crateId}?error=remove-track`);
  }
  const { error } = await supabase
    .from("crate_tracks")
    .delete()
    .eq("crate_id", parsed.crateId)
    .eq("track_id", parsed.trackId)
    .eq("user_id", user.id);

  if (error) redirect(`/crates/${parsed.crateId}?error=remove-track`);
  revalidatePath("/crates");
  revalidatePath(`/crates/${parsed.crateId}`);
  redirect(`/crates/${parsed.crateId}?trackRemoved=1`);
}

export async function moveTrackInCrateAction(formData: FormData) {
  await requireUser();
  const parsed = moveTrackSchema.parse({
    crateId: formData.get("crateId"),
    direction: formData.get("direction"),
    trackId: formData.get("trackId"),
  });
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as CrateMutationRpc;
  const { error } = await rpc("move_track_in_manual_crate", {
    requested_crate_id: parsed.crateId,
    requested_direction: parsed.direction,
    requested_track_id: parsed.trackId,
  });

  if (error) redirect(`/crates/${parsed.crateId}?error=reorder`);
  revalidatePath(`/crates/${parsed.crateId}`);
}
