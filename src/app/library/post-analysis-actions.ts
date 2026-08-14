"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { parseTrackQuery, safeSearchTerm } from "@/lib/library/track-query";
import {
  crateValuesSchema,
  organizationIdSchema,
} from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

const createCrateFromTrackIdsSchema = z.object({
  name: crateValuesSchema.shape.name,
  trackIds: z.array(organizationIdSchema).min(1).max(25),
});

const createCrateFromFiltersSchema = z.object({
  name: crateValuesSchema.shape.name,
  searchParams: z.string().max(2_048),
});

export type CreateCrateFromTrackIdsResult =
  | { status: "created"; crateId: string }
  | { status: "duplicate" | "invalid" | "failed" };

async function persistCrate(
  supabase: SupabaseClient<Database>,
  name: string,
  trackIds: string[],
): Promise<CreateCrateFromTrackIdsResult> {
  const { data: crateId, error } = await supabase.rpc(
    "create_post_analysis_crate",
    {
      crate_name: name,
      track_ids: trackIds,
    },
  );

  if (error?.code === "23505") return { status: "duplicate" };
  if (error || !crateId) return { status: "failed" };

  revalidatePath("/crates");
  revalidatePath(`/crates/${crateId}`);
  return { status: "created", crateId };
}

export async function createCrateFromTrackIdsAction(
  input: unknown,
): Promise<CreateCrateFromTrackIdsResult> {
  const parsed = createCrateFromTrackIdsSchema.safeParse(input);
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

  return persistCrate(supabase, parsed.data.name, trackIds);
}

export async function createCrateFromFiltersAction(
  input: unknown,
): Promise<CreateCrateFromTrackIdsResult> {
  const parsed = createCrateFromFiltersSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };

  await requireUser();
  const query = parseTrackQuery(
    Object.fromEntries(new URLSearchParams(parsed.data.searchParams)),
  );
  const supabase = await createClient();
  const { data: crateId, error } = await supabase.rpc(
    "create_crate_from_library_filters",
    {
      crate_name: parsed.data.name,
      search_term: query.q ? safeSearchTerm(query.q) : "",
      genre_filter: query.genre ?? null,
      subgenre_filter: query.subgenre ?? null,
      bpm_min: query.bpmMin ?? null,
      bpm_max: query.bpmMax ?? null,
      key_filter: query.key ?? null,
      camelot_filter: query.camelot ?? null,
      energy_min: query.energyMin ?? null,
      energy_max: query.energyMax ?? null,
      rating_min: query.rating ?? null,
      sort_key: query.sort,
      sort_direction: query.direction,
    },
  );

  if (error?.code === "23505") return { status: "duplicate" };
  if (error || !crateId) return { status: "failed" };

  revalidatePath("/crates");
  revalidatePath(`/crates/${crateId}`);
  return { status: "created", crateId };
}

export async function createPostAnalysisCrateAction(
  input: unknown,
): Promise<CreateCrateFromTrackIdsResult> {
  return createCrateFromTrackIdsAction(input);
}
