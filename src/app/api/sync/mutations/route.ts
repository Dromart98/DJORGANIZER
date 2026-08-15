import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/user";
import { parseBulkTrackUpdate } from "@/lib/library/bulk-track-update";
import {
  maestEvidenceFromFormData,
  nativeAnalysisEvidenceFromFormData,
  toTrackInsert,
  toTrackUpdate,
  trackIdSchema,
  trackIdsSchema,
  trackValuesFromFormData,
} from "@/lib/library/track-schema";
import {
  crateValuesFromFormData,
  moveTrackIds,
  moveTrackSchema,
  organizationIdSchema,
  tagAssignmentSchema,
  tagNameSchema,
  trackAssignmentSchema,
} from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const actions = [
  "crate-create",
  "crate-delete",
  "crate-track-add",
  "crate-track-move",
  "crate-track-remove",
  "crate-update",
  "tag-assign",
  "tag-create",
  "tag-delete",
  "tag-unassign",
  "track-bulk-update",
  "track-create",
  "track-delete",
  "track-update",
] as const;

const payloadSchema = z
  .record(
    z.string().max(80),
    z.union([
      z.string().max(5_000),
      z.array(z.string().max(5_000)).max(100),
    ]),
  )
  .refine((payload) => Object.keys(payload).length <= 40);

const mutationSchema = z.object({
  action: z.enum(actions),
  entityId: z.string().min(1).max(400),
  id: z.string().uuid(),
  payload: payloadSchema,
  revision: z.string().datetime().nullable(),
});

const requestSchema = z.object({
  mutations: z.array(mutationSchema).min(1).max(100),
});

type Mutation = z.infer<typeof mutationSchema>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

type UpdateTrackWithHistoryRpc = (
  functionName: "update_track_with_history",
  args: {
    expected_updated_at: string;
    requested_patch: Record<string, unknown>;
    requested_track_id: string;
  },
) => Promise<{
  data: { track_id: string } | null;
  error: { message?: string } | null;
}>;

type BulkUpdateTracksWithHistoryRpc = (
  functionName: "bulk_update_tracks_with_history",
  args: {
    requested_patch: Record<string, unknown>;
    requested_track_ids: string[];
  },
) => Promise<{
  data: { batch_id: string | null; changed_count: number } | null;
  error: { message?: string } | null;
}>;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, no-store" },
    status,
  });
}

function values(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return typeof value === "string" ? [value] : [];
}

function value(payload: Record<string, unknown>, key: string) {
  return values(payload, key)[0] ?? "";
}

function payloadFormData(payload: Record<string, unknown>) {
  const formData = new FormData();
  for (const [key, raw] of Object.entries(payload)) {
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      if (typeof item === "string") formData.append(key, item);
    }
  }
  return formData;
}

async function revisionConflict(
  supabase: Supabase,
  table: "crates" | "tags" | "tracks",
  id: string,
  userId: string,
  revision: string | null,
) {
  if (!revision) return null;
  const { data, error } = await supabase
    .from(table)
    .select("updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("No se pudo comprobar la revisión remota.");
  if (!data) {
    return { reason: "deleted-remotely" as const, remote: null };
  }
  if (data.updated_at !== revision) {
    return {
      reason: "revision-mismatch" as const,
      remote: { updated_at: data.updated_at },
    };
  }
  return null;
}

async function validParentCrate(
  supabase: Supabase,
  parentId: string | null,
  userId: string,
  currentId?: string,
) {
  if (!parentId) return true;
  if (parentId === currentId) return false;
  const { data, error } = await supabase
    .from("crates")
    .select("id, parent_id")
    .eq("user_id", userId)
    .limit(1000);
  if (error) return false;
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

async function applyMutation(
  mutation: Mutation,
  supabase: Supabase,
  userId: string,
) {
  const formData = payloadFormData(mutation.payload);
  switch (mutation.action) {
    case "track-create": {
      const id = trackIdSchema.parse(mutation.entityId);
      const track = trackValuesFromFormData(formData);
      const { error } = await supabase
        .from("tracks")
        .insert({ ...toTrackInsert(track, userId), id });
      if (error) throw new Error("No se pudo crear la canción.");
      break;
    }
    case "track-update": {
      const id = trackIdSchema.parse(value(mutation.payload, "id"));
      if (!mutation.revision) {
        throw new Error("La edición pendiente no incluye una revisión segura.");
      }
      const conflict = await revisionConflict(
        supabase,
        "tracks",
        id,
        userId,
        mutation.revision,
      );
      if (conflict) return { conflict };
      const track = trackValuesFromFormData(formData);
      const { data: persisted, error: readError } = await supabase
        .from("tracks")
        .select("bpm, bpm_confidence, bpm_explanation, bpm_source, camelot_key, energy, energy_confidence, energy_source, genre, genre_analyzed_at_ms, genre_analyzer_id, genre_analyzer_version, genre_compatibility_key, genre_confidence, genre_raw_score, genre_source, key_confidence, key_explanation, key_source, musical_key, subgenre, subgenre_analyzed_at_ms, subgenre_analyzer_id, subgenre_analyzer_version, subgenre_compatibility_key, subgenre_confidence, subgenre_raw_score, subgenre_source")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (readError || !persisted) {
        throw new Error("No se pudo actualizar la canción.");
      }
      const patch = toTrackUpdate(
        track,
        persisted,
        maestEvidenceFromFormData(formData),
        nativeAnalysisEvidenceFromFormData(formData),
      );
      const rpc = supabase.rpc.bind(supabase) as unknown as UpdateTrackWithHistoryRpc;
      const { data, error } = await rpc("update_track_with_history", {
        expected_updated_at: mutation.revision,
        requested_patch: patch,
        requested_track_id: id,
      });
      if (error || !data) {
        const message = error?.message ?? "";
        if (message.includes("Track changed after form loaded")) {
          const lateConflict = await revisionConflict(
            supabase,
            "tracks",
            id,
            userId,
            mutation.revision,
          );
          if (lateConflict) return { conflict: lateConflict };
        }
        if (message.includes("Track not found")) {
          return {
            conflict: { reason: "deleted-remotely" as const, remote: null },
          };
        }
        throw new Error("No se pudo actualizar la canción.");
      }
      break;
    }
    case "track-bulk-update": {
      const change = parseBulkTrackUpdate({
        field: value(mutation.payload, "field"),
        trackIds: values(mutation.payload, "trackId"),
        value: value(mutation.payload, "value"),
      });
      const rpc = supabase.rpc.bind(supabase) as unknown as BulkUpdateTracksWithHistoryRpc;
      const { data, error } = await rpc("bulk_update_tracks_with_history", {
        requested_patch: change.update,
        requested_track_ids: change.trackIds,
      });
      if (error || !data) throw new Error("No se pudo aplicar la edición masiva.");
      break;
    }
    case "track-delete": {
      const ids = trackIdsSchema.parse(
        values(mutation.payload, "trackId").length
          ? values(mutation.payload, "trackId")
          : [value(mutation.payload, "id")],
      );
      if (ids.length === 1) {
        const conflict = await revisionConflict(
          supabase,
          "tracks",
          ids[0],
          userId,
          mutation.revision,
        );
        if (conflict) return { conflict };
      }
      const { error } = await supabase
        .from("tracks")
        .delete()
        .eq("user_id", userId)
        .in("id", ids);
      if (error) throw new Error("No se pudieron eliminar las canciones.");
      break;
    }
    case "crate-create":
    case "crate-update": {
      const parsed = crateValuesFromFormData(formData);
      const id =
        mutation.action === "crate-create"
          ? organizationIdSchema.parse(mutation.entityId)
          : organizationIdSchema.parse(value(mutation.payload, "id"));
      if (!(await validParentCrate(supabase, parsed.parent_id, userId, id))) {
        throw new Error("La jerarquía del crate no es válida.");
      }
      if (mutation.action === "crate-create") {
        const { error } = await supabase
          .from("crates")
          .insert({ ...parsed, id, user_id: userId });
        if (error) throw new Error("No se pudo crear el crate.");
      } else {
        const conflict = await revisionConflict(
          supabase,
          "crates",
          id,
          userId,
          mutation.revision,
        );
        if (conflict) return { conflict };
        const { data, error } = await supabase
          .from("crates")
          .update(parsed)
          .eq("id", id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle();
        if (error || !data) throw new Error("No se pudo actualizar el crate.");
      }
      break;
    }
    case "crate-delete": {
      const id = organizationIdSchema.parse(value(mutation.payload, "id"));
      const conflict = await revisionConflict(
        supabase,
        "crates",
        id,
        userId,
        mutation.revision,
      );
      if (conflict) return { conflict };
      const { error } = await supabase
        .from("crates")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error("No se pudo eliminar el crate.");
      break;
    }
    case "tag-create": {
      const id = organizationIdSchema.parse(mutation.entityId);
      const name = tagNameSchema.parse(value(mutation.payload, "name"));
      const { error } = await supabase
        .from("tags")
        .insert({ id, name, user_id: userId });
      if (error) throw new Error("No se pudo crear la etiqueta.");
      break;
    }
    case "tag-delete": {
      const id = organizationIdSchema.parse(value(mutation.payload, "id"));
      const conflict = await revisionConflict(
        supabase,
        "tags",
        id,
        userId,
        mutation.revision,
      );
      if (conflict) return { conflict };
      const { error } = await supabase
        .from("tags")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error("No se pudo eliminar la etiqueta.");
      break;
    }
    case "tag-assign":
    case "tag-unassign": {
      const parsed = tagAssignmentSchema.parse({
        tagId: value(mutation.payload, "tagId"),
        trackIds: values(mutation.payload, "trackId"),
      });
      const rows = parsed.trackIds.map((trackId) => ({
        tag_id: parsed.tagId,
        track_id: trackId,
        user_id: userId,
      }));
      const { error } =
        mutation.action === "tag-assign"
          ? await supabase
              .from("track_tags")
              .upsert(rows, {
                ignoreDuplicates: true,
                onConflict: "track_id,tag_id",
              })
          : await supabase
              .from("track_tags")
              .delete()
              .eq("user_id", userId)
              .eq("tag_id", parsed.tagId)
              .in("track_id", parsed.trackIds);
      if (error) throw new Error("No se pudieron sincronizar las etiquetas.");
      break;
    }
    case "crate-track-add":
    case "crate-track-remove":
    case "crate-track-move": {
      const assignment = trackAssignmentSchema.parse({
        crateId: value(mutation.payload, "crateId"),
        trackId: value(mutation.payload, "trackId"),
      });
      const direction =
        mutation.action === "crate-track-move"
          ? moveTrackSchema.parse({
              ...assignment,
              direction: value(mutation.payload, "direction"),
            }).direction
          : null;
      if (mutation.action === "crate-track-remove") {
        const { error } = await supabase
          .from("crate_tracks")
          .delete()
          .eq("crate_id", assignment.crateId)
          .eq("track_id", assignment.trackId)
          .eq("user_id", userId);
        if (error) throw new Error("No se pudo quitar la pista del crate.");
        break;
      }
      if (mutation.action === "crate-track-add") {
        const { data: last } = await supabase
          .from("crate_tracks")
          .select("position")
          .eq("crate_id", assignment.crateId)
          .eq("user_id", userId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { error } = await supabase.from("crate_tracks").upsert(
          {
            crate_id: assignment.crateId,
            position: (last?.position ?? -1) + 1,
            track_id: assignment.trackId,
            user_id: userId,
          },
          { ignoreDuplicates: true, onConflict: "crate_id,track_id" },
        );
        if (error) throw new Error("No se pudo añadir la pista al crate.");
        break;
      }
      const { data, error } = await supabase
        .from("crate_tracks")
        .select("track_id")
        .eq("crate_id", assignment.crateId)
        .eq("user_id", userId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error("No se pudo leer el orden del crate.");
      const current = (data ?? []).map((item) => item.track_id);
      const ordered = moveTrackIds(
        current,
        assignment.trackId,
        direction ?? "up",
      );
      const { error: reorderError } = await supabase.from("crate_tracks").upsert(
        ordered.map((trackId, position) => ({
          crate_id: assignment.crateId,
          position,
          track_id: trackId,
          user_id: userId,
        })),
        { onConflict: "crate_id,track_id" },
      );
      if (reorderError) throw new Error("No se pudo reordenar el crate.");
      break;
    }
  }
  return { conflict: null };
}

export async function POST(request: Request) {
  const user = await getOptionalUser();
  if (!user) return response({ error: "Sesión no válida." }, 401);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512 * 1024) {
    return response({ error: "La cola supera el tamaño permitido." }, 413);
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return response({ error: "La cola de sincronización no es válida." }, 400);
  }

  const supabase = await createClient();
  const results = [];
  for (const mutation of input.mutations) {
    try {
      const result = await applyMutation(mutation, supabase, user.id);
      results.push({
        conflict: result.conflict,
        id: mutation.id,
        status: result.conflict ? "conflict" : "applied",
      });
    } catch (error) {
      results.push({
        error:
          error instanceof z.ZodError
            ? "Los datos pendientes no son válidos."
            : error instanceof Error
              ? error.message
              : "No se pudo aplicar el cambio.",
        id: mutation.id,
        status: "failed",
      });
    }
  }

  return response({ results });
}
