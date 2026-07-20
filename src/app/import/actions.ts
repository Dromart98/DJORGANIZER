"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import {
  acousticSimilarity,
  detectVersionRelationship,
  type AcousticSignature,
  type VersionRelationship,
} from "@/lib/audio/acoustic-similarity";
import {
  fingerprintBatchSchema,
  importBatchSchema,
  type ImportTrackInput,
} from "@/lib/import/import-schema";
import { normalizeMusicalKey } from "@/lib/music/key-normalization";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";

export type ImportResult = {
  client_id: string;
  message?: string;
  status: "saved" | "error" | "duplicate";
  track_id?: string;
};

export type ImportBatchResult = {
  message?: string;
  results: ImportResult[];
};

export type DuplicateTrack = {
  file_fingerprint: string;
  title: string;
  track_id: string;
};

export type DuplicateCheckResult = {
  duplicates: DuplicateTrack[];
  message?: string;
};


export type DesktopLibraryLinkCandidate = {
  fileFingerprint: string;
  fileSize: number;
  trackId: string;
};

export type DesktopLibraryLinkCandidatesResult = {
  candidates: DesktopLibraryLinkCandidate[];
  message?: string;
};

const acousticSignatureSchema = z.object({
  durationSeconds: z.number().positive().max(86_400),
  energyEnvelope: z.array(z.number().finite()).length(32),
  zeroCrossingEnvelope: z.array(z.number().finite()).length(32),
});

const acousticMatchBatchSchema = z
  .array(
    z.object({
      acousticFingerprint: z.string().max(5000),
      bpm: z.number().positive().max(400).nullable(),
      clientId: z.string().min(1).max(128),
      durationSeconds: z.number().positive().max(86_400).nullable(),
      title: z.string().trim().min(1).max(300),
    }),
  )
  .min(1)
  .max(100);

export type AcousticLibraryMatch = {
  clientId: string;
  relationship: Exclude<VersionRelationship, "unrelated">;
  similarity: number;
  trackId: string;
  trackTitle: string;
};

function parseAcousticSignature(value: string | null) {
  if (!value) return null;
  try {
    const parsed = acousticSignatureSchema.safeParse(JSON.parse(value));
    return parsed.success ? (parsed.data as AcousticSignature) : null;
  } catch {
    return null;
  }
}

export async function checkAcousticMatchesAction(
  input: unknown,
): Promise<{ matches: AcousticLibraryMatch[]; message?: string }> {
  const user = await requireUser();
  const parsed = acousticMatchBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      matches: [],
      message: "No se pudieron validar las firmas acústicas.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, bpm, duration_seconds, acoustic_fingerprint")
    .eq("user_id", user.id)
    .not("acoustic_fingerprint", "is", null)
    .limit(10_000);
  if (error) {
    console.error("Acoustic duplicate lookup failed", error);
    return {
      matches: [],
      message: "No se pudo comparar con las firmas de tu biblioteca.",
    };
  }

  const library = (data ?? []).flatMap((track) => {
    const signature = parseAcousticSignature(track.acoustic_fingerprint);
    return signature ? [{ signature, track }] : [];
  });
  const matches: AcousticLibraryMatch[] = [];
  for (const candidate of parsed.data) {
    const signature = parseAcousticSignature(candidate.acousticFingerprint);
    if (!signature) continue;
    let best: AcousticLibraryMatch | null = null;
    for (const existing of library) {
      const similarity = acousticSimilarity(signature, existing.signature);
      const relationship = detectVersionRelationship(
        {
          bpm: candidate.bpm,
          durationSeconds: candidate.durationSeconds,
          title: candidate.title,
        },
        {
          bpm: existing.track.bpm,
          durationSeconds: existing.track.duration_seconds,
          title: existing.track.title,
        },
        similarity,
      );
      if (
        relationship !== "unrelated" &&
        (!best || similarity > best.similarity)
      ) {
        best = {
          clientId: candidate.clientId,
          relationship,
          similarity,
          trackId: existing.track.id,
          trackTitle: existing.track.title,
        };
      }
    }
    if (best) matches.push(best);
  }
  return { matches };
}

export type DesktopCrateExport = {
  hierarchy: string[];
  id: string;
  name: string;
  tracks: Array<{ artist: string | null; id: string; title: string }>;
  trackIds: string[];
};

const virtualDjReconciliationSchema = z.object({
  hierarchy: z
    .array(z.string().trim().min(1).max(120))
    .max(8)
    .default([]),
  linkedTrackIds: z.array(z.string().uuid()).max(10_000),
  listName: z.string().trim().min(1).max(120),
  mode: z.enum(["merge", "replace"]).default("merge"),
  unresolvedCount: z.number().int().min(0).max(10_000).default(0),
});

export type VirtualDjReconciliationResult = {
  crateId?: string;
  message: string;
  ok: boolean;
};

const virtualDjExportHistorySchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      trackIds: z.array(z.string().uuid()).max(10_000),
    }),
  )
  .min(1)
  .max(200);

export async function recordVirtualDjExportsAction(input: unknown) {
  const user = await requireUser();
  const parsed = virtualDjExportHistorySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("integration_syncs").insert(
    parsed.data.map((item) => ({
      conflict_count: 0,
      direction: "export",
      list_name: item.name,
      provider: "virtualdj",
      track_ids: [...new Set(item.trackIds)],
      user_id: user.id,
    })),
  );
  if (error) {
    console.error("VirtualDJ export history failed", error.code);
    return { ok: false };
  }
  return { ok: true };
}

async function findOrCreateCrate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
  parentId: string | null,
) {
  const { data: existing, error: lookupError } = await supabase
    .from("crates")
    .select("id, parent_id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    if (existing.parent_id !== parentId) {
      throw new Error(
        `El crate “${name}” ya existe en otra jerarquía. Renómbralo antes de reconciliar.`,
      );
    }
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("crates")
    .insert({ name, parent_id: parentId, user_id: userId })
    .select("id")
    .single();
  if (createError || !created) {
    throw createError ?? new Error("No se pudo crear el crate.");
  }
  return created.id;
}

export async function reconcileVirtualDjListAction(
  input: unknown,
): Promise<VirtualDjReconciliationResult> {
  const user = await requireUser();
  const parsed = virtualDjReconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      message: "La propuesta de VirtualDJ no contiene datos válidos.",
      ok: false,
    };
  }

  const supabase = await createClient();
  try {
    let parentId: string | null = null;
    for (const segment of parsed.data.hierarchy) {
      parentId = await findOrCreateCrate(supabase, user.id, segment, parentId);
    }
    const crateId = await findOrCreateCrate(
      supabase,
      user.id,
      parsed.data.listName,
      parentId,
    );

    const { data: currentRows, error: currentError } = await supabase
      .from("crate_tracks")
      .select("track_id, position")
      .eq("user_id", user.id)
      .eq("crate_id", crateId)
      .order("position");
    if (currentError) throw currentError;

    const remoteIds = [...new Set(parsed.data.linkedTrackIds)];
    const remoteIdSet = new Set(remoteIds);
    const currentIds = (currentRows ?? []).map((row) => row.track_id);
    const desiredIds =
      parsed.data.mode === "merge"
        ? [
            ...remoteIds,
            ...currentIds.filter((trackId) => !remoteIdSet.has(trackId)),
          ]
        : remoteIds;

    const { error: reconcileError } = await supabase.rpc(
      "reconcile_crate_tracks",
      {
        desired_track_ids: desiredIds,
        remove_missing: parsed.data.mode === "replace",
        target_crate_id: crateId,
      },
    );
    if (reconcileError) throw reconcileError;

    const { error: historyError } = await supabase
      .from("integration_syncs")
      .insert({
        conflict_count: parsed.data.unresolvedCount,
        direction: "reconcile",
        list_name: parsed.data.listName,
        provider: "virtualdj",
        track_ids: remoteIds,
        user_id: user.id,
      });
    if (historyError) {
      console.error("VirtualDJ reconciliation history failed", historyError);
    }

    revalidatePath("/crates");
    revalidatePath(`/crates/${crateId}`);
    return {
      crateId,
      message:
        parsed.data.mode === "replace"
          ? `Crate actualizado con ${remoteIds.length} pistas en el orden de VirtualDJ.`
          : `Crate combinado con ${remoteIds.length} pistas vinculadas de VirtualDJ.`,
      ok: true,
    };
  } catch (error) {
    console.error("VirtualDJ reconciliation failed", error);
    return {
      message:
        error instanceof Error
          ? error.message
          : "No se pudo aplicar la reconciliación.",
      ok: false,
    };
  }
}

export async function getDesktopCratesForExportAction(): Promise<{
  crates: DesktopCrateExport[];
  message?: string;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: crates, error: cratesError }, { count: membershipCount, error: membershipsError }] =
    await Promise.all([
      supabase
        .from("crates")
        .select("id, name, parent_id")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("crate_tracks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
    ]);
  if (cratesError || membershipsError) {
    return { crates: [], message: "No se pudieron preparar los crates." };
  }
  const memberships: Array<{ crate_id: string; position: number; track_id: string }> = [];
  const MEMBERSHIPS_PER_PAGE = 500;
  for (let from = 0; from < (membershipCount ?? 0); from += MEMBERSHIPS_PER_PAGE) {
    const { data, error } = await supabase
      .from("crate_tracks")
      .select("crate_id, track_id, position")
      .eq("user_id", user.id)
      .order("crate_id", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + MEMBERSHIPS_PER_PAGE - 1);
    if (error) return { crates: [], message: "No se pudieron preparar los crates." };
    memberships.push(...(data ?? []));
  }
  const rows = crates ?? [];
  const byId = new Map(rows.map((crate) => [crate.id, crate]));
  const hierarchyFor = (crateId: string) => {
    const hierarchy: string[] = [];
    const seen = new Set<string>();
    let parentId = byId.get(crateId)?.parent_id ?? null;
    while (parentId && !seen.has(parentId) && hierarchy.length < 8) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      hierarchy.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return hierarchy;
  };
  const tracksByCrate = new Map<string, string[]>();
  for (const membership of memberships) {
    const trackIds = tracksByCrate.get(membership.crate_id) ?? [];
    trackIds.push(membership.track_id);
    tracksByCrate.set(membership.crate_id, trackIds);
  }
  const trackIds = [...new Set(memberships.map((membership) => membership.track_id))];
  const tracks = [] as Array<{ artist: string | null; id: string; title: string }>;
  for (let index = 0; index < trackIds.length; index += 500) {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, artist")
      .eq("user_id", user.id)
      .in("id", trackIds.slice(index, index + 500));
    if (error) return { crates: [], message: "No se pudieron preparar las pistas de los crates." };
    tracks.push(...(data ?? []));
  }
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  return {
    crates: rows.map((crate) => ({
      hierarchy: hierarchyFor(crate.id),
      id: crate.id,
      name: crate.name,
      tracks: (tracksByCrate.get(crate.id) ?? []).flatMap((id) => {
        const track = tracksById.get(id);
        return track ? [{ artist: track.artist, id: track.id, title: track.title }] : [];
      }),
      trackIds: tracksByCrate.get(crate.id) ?? [],
    })),
  };
}

function toTrackInsert(
  track: ImportTrackInput,
  userId: string,
): TablesInsert<"tracks"> {
  const normalizedKey = normalizeMusicalKey(track.musical_key);
  return {
    acoustic_fingerprint: track.acoustic_fingerprint,
    album: track.album,
    artist: track.artist,
    bpm: track.bpm,
    bpm_confidence: track.bpm_confidence,
    bpm_explanation: track.bpm_explanation,
    bpm_source: track.bpm_source,
    duration_seconds: track.duration_seconds,
    energy: track.energy,
    camelot_key: normalizedKey?.camelotKey ?? null,
    file_fingerprint: track.file_fingerprint,
    file_name: track.file_name,
    file_size: track.file_size,
    file_type: track.file_type,
    genre: track.genre,
    genre_confidence: track.genre_confidence,
    genre_source: track.genre_source,
    key_confidence: track.key_confidence,
    key_explanation: track.key_explanation,
    key_source: track.key_source,
    musical_key: normalizedKey?.musicalKey ?? track.musical_key,
    release_year: track.release_year,
    title: track.title,
    user_id: userId,
    version_type: track.version_type,
  };
}

export async function checkImportDuplicatesAction(
  input: unknown,
): Promise<DuplicateCheckResult> {
  const user = await requireUser();
  const parsed = fingerprintBatchSchema.safeParse(input);

  if (!parsed.success) {
    return {
      duplicates: [],
      message: "No se pudieron comprobar las huellas de los archivos.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, file_fingerprint")
    .eq("user_id", user.id)
    .in("file_fingerprint", parsed.data);

  if (error) {
    console.error("Duplicate lookup failed", error);
    return {
      duplicates: [],
      message:
        "No se pudo comprobar la biblioteca. Podrás reintentarlo al guardar.",
    };
  }

  return {
    duplicates: data.flatMap((track) =>
      track.file_fingerprint
        ? [
            {
              file_fingerprint: track.file_fingerprint,
              title: track.title,
              track_id: track.id,
            },
          ]
        : [],
    ),
  };
}

export async function saveImportedTracksAction(
  input: unknown,
): Promise<ImportBatchResult> {
  const user = await requireUser();
  const parsed = importBatchSchema.safeParse(input);

  if (!parsed.success) {
    return {
      message: "El lote contiene metadatos no válidos.",
      results: [],
    };
  }

  const supabase = await createClient();
  const fingerprints = [
    ...new Set(parsed.data.map((track) => track.file_fingerprint)),
  ];
  const { data: existingTracks, error: duplicateError } = await supabase
    .from("tracks")
    .select("id, title, file_fingerprint")
    .eq("user_id", user.id)
    .in("file_fingerprint", fingerprints);

  if (duplicateError) {
    console.error("Duplicate lookup before insert failed", duplicateError);
    return {
      message: "No se pudo comprobar la biblioteca antes de guardar.",
      results: [],
    };
  }

  const existingByFingerprint = new Map(
    existingTracks.flatMap((track) =>
      track.file_fingerprint
        ? [[track.file_fingerprint, { id: track.id, title: track.title }] as const]
        : [],
    ),
  );

  const results = await Promise.all(
    parsed.data.map(async (track: ImportTrackInput): Promise<ImportResult> => {
      const existing = existingByFingerprint.get(track.file_fingerprint);

      if (existing) {
        return {
          client_id: track.client_id,
          message: `Ya existe en tu biblioteca: “${existing.title}”.`,
          status: "duplicate",
          track_id: existing.id,
        };
      }

      const { data, error } = await supabase
        .from("tracks")
        .insert(toTrackInsert(track, user.id))
        .select("id")
        .single();

      if (error?.code === "23505") {
        return {
          client_id: track.client_id,
          message: "Esta pista ya se guardó en tu biblioteca.",
          status: "duplicate",
        };
      }

      if (error || !data) {
        console.error("Imported track insert failed", error);
        return {
          client_id: track.client_id,
          message: "No se pudo guardar esta pista.",
          status: "error",
        };
      }

      return {
        client_id: track.client_id,
        status: "saved",
        track_id: data.id,
      };
    }),
  );

  if (results.some((result: ImportResult) => result.status === "saved")) {
    revalidatePath("/library");
  }

  return { results };
}

export async function getDesktopLibraryLinkCandidatesAction(): Promise<DesktopLibraryLinkCandidatesResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { count, data, error } = await supabase
    .from("tracks")
    .select("id, file_fingerprint, file_size", { count: "exact" })
    .eq("user_id", user.id)
    .not("file_fingerprint", "is", null)
    .not("file_size", "is", null)
    .order("created_at", { ascending: true })
    .limit(10_000);

  if (error) {
    console.error("Desktop library link lookup failed", error);
    return {
      candidates: [],
      message: "No se pudo preparar la vinculación con la biblioteca.",
    };
  }

  const candidates = (data ?? []).flatMap((track) =>
    track.file_fingerprint &&
    /^[a-f0-9]{64}$/.test(track.file_fingerprint) &&
    track.file_size !== null &&
    Number.isSafeInteger(track.file_size) &&
    track.file_size >= 0
      ? [
          {
            fileFingerprint: track.file_fingerprint,
            fileSize: track.file_size,
            trackId: track.id,
          },
        ]
      : [],
  );

  return {
    candidates,
    message:
      count !== null && count > candidates.length
        ? "La vinculación se limitó a las primeras 10.000 pistas con huella."
        : undefined,
  };
}
