"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import {
  METADATA_CLEANUP_FIELDS,
  proposeMetadataCleanup,
  type MetadataCleanupField,
} from "@/lib/library/metadata-cleanup";
import { trackIdSchema } from "@/lib/library/track-schema";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";

const MAX_CLEANUP_PROPOSALS = 100;

const cleanupProposalSchema = z
  .object({
    currentValue: z.string().min(1).max(300),
    field: z.enum(METADATA_CLEANUP_FIELDS),
    proposedValue: z.string().min(1).max(300),
    trackId: trackIdSchema,
  })
  .strict();

type CleanupProposalInput = z.infer<typeof cleanupProposalSchema>;

type CleanupTrackRow = {
  album: string | null;
  artist: string | null;
  genre: string | null;
  id: string;
  subgenre: string | null;
  title: string;
};

function cleanupUpdate(
  field: MetadataCleanupField,
  proposedValue: string,
): TablesUpdate<"tracks"> {
  switch (field) {
    case "title":
      return { title: proposedValue };
    case "artist":
      return { artist: proposedValue };
    case "album":
      return { album: proposedValue };
    case "genre":
      return {
        genre: proposedValue,
        genre_analyzed_at_ms: null,
        genre_analyzer_id: null,
        genre_analyzer_version: null,
        genre_compatibility_key: null,
        genre_confidence: null,
        genre_raw_score: null,
        genre_source: "manual",
      };
    case "subgenre":
      return {
        subgenre: proposedValue,
        subgenre_analyzed_at_ms: null,
        subgenre_analyzer_id: null,
        subgenre_analyzer_version: null,
        subgenre_compatibility_key: null,
        subgenre_confidence: null,
        subgenre_raw_score: null,
        subgenre_source: "manual",
      };
  }
}

function currentValue(row: CleanupTrackRow, field: MetadataCleanupField) {
  return row[field];
}

function withStatus(applied: number, skipped: number, failed: number) {
  const params = new URLSearchParams({
    applied: String(applied),
    failed: String(failed),
    skipped: String(skipped),
  });
  return `/library/health/cleanup?${params.toString()}`;
}

export async function applyMetadataCleanupAction(formData: FormData) {
  const user = await requireUser();
  const raw = formData.getAll("proposal");
  if (!raw.length || raw.length > MAX_CLEANUP_PROPOSALS) {
    redirect(withStatus(0, 0, raw.length ? raw.length : 0));
  }

  const parsed: CleanupProposalInput[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.length > 1_500) continue;
    try {
      const result = cleanupProposalSchema.safeParse(JSON.parse(entry));
      if (!result.success) continue;
      const key = `${result.data.trackId}:${result.data.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push(result.data);
    } catch {
      // Invalid client data is skipped; server-generated proposals remain authoritative.
    }
  }

  if (!parsed.length) redirect(withStatus(0, raw.length, 0));

  const supabase = await createClient();
  const trackIds = [...new Set(parsed.map((proposal) => proposal.trackId))];
  const { data: tracks, error: readError } = await supabase
    .from("tracks")
    .select("id, title, artist, album, genre, subgenre")
    .eq("user_id", user.id)
    .in("id", trackIds);

  if (readError) redirect(withStatus(0, 0, parsed.length));

  const byId = new Map((tracks ?? []).map((track) => [track.id, track]));
  const validByTrack = new Map<string, CleanupProposalInput[]>();
  let skipped = raw.length - parsed.length;

  for (const proposal of parsed) {
    const track = byId.get(proposal.trackId);
    const current = track ? currentValue(track, proposal.field) : null;
    const recomputed = proposeMetadataCleanup(proposal.field, current);
    if (
      current !== proposal.currentValue ||
      recomputed?.proposedValue !== proposal.proposedValue
    ) {
      skipped += 1;
      continue;
    }
    const group = validByTrack.get(proposal.trackId) ?? [];
    group.push(proposal);
    validByTrack.set(proposal.trackId, group);
  }

  let applied = 0;
  let failed = 0;
  const appliedTrackIds: string[] = [];

  for (const [trackId, proposals] of validByTrack) {
    let update: TablesUpdate<"tracks"> = {};
    for (const proposal of proposals) {
      update = { ...update, ...cleanupUpdate(proposal.field, proposal.proposedValue) };
    }

    let query = supabase
      .from("tracks")
      .update(update)
      .eq("id", trackId)
      .eq("user_id", user.id);
    for (const proposal of proposals) {
      query = query.eq(proposal.field, proposal.currentValue);
    }

    const { data, error } = await query.select("id").maybeSingle();
    if (error) {
      failed += proposals.length;
      continue;
    }
    if (!data) {
      skipped += proposals.length;
      continue;
    }
    applied += proposals.length;
    appliedTrackIds.push(trackId);
  }

  if (appliedTrackIds.length) {
    revalidatePath("/library");
    revalidatePath("/library/health");
    revalidatePath("/library/health/cleanup");
    for (const trackId of appliedTrackIds) revalidatePath(`/library/${trackId}`);
  }

  redirect(withStatus(applied, skipped, failed));
}
