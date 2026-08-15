"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth/user";
import { translate, translateKnown } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";
import { bulkTrackUpdateFromFormData } from "@/lib/library/bulk-track-update";
import {
  toTrackInsert,
  toTrackUpdate,
  maestEvidenceFromFormData,
  nativeAnalysisEvidenceFromFormData,
  trackIdSchema,
  trackIdsSchema,
  trackValuesFromFormData,
  type TrackFormValues,
} from "@/lib/library/track-schema";
import { createClient } from "@/lib/supabase/server";

export type TrackActionState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  status: "idle" | "error";
};

const trackRevisionSchema = z.string().datetime({ offset: true });
const historyIdSchema = z.string().uuid();
const historyBatchIdSchema = z.string().uuid();

type UpdateTrackWithHistoryRpc = (
  functionName: "update_track_with_history",
  args: {
    expected_updated_at: string;
    requested_patch: Record<string, unknown>;
    requested_track_id: string;
  },
) => Promise<{
  data:
    | {
        changed: boolean;
        history_id: string | null;
        track_id: string;
      }
    | null;
  error: { message?: string } | null;
}>;

type UndoTrackEditRpc = (
  functionName: "undo_track_edit",
  args: { requested_history_id: string },
) => Promise<{
  data: { history_id: string; track_id: string } | null;
  error: { message?: string } | null;
}>;

type BulkUpdateTracksWithHistoryRpc = (
  functionName: "bulk_update_tracks_with_history",
  args: {
    requested_patch: Record<string, unknown>;
    requested_track_ids: string[];
  },
) => Promise<{
  data:
    | {
        batch_id: string | null;
        changed_count: number;
        requested_count: number;
      }
    | null;
  error: { message?: string } | null;
}>;

type UndoBulkTrackEditRpc = (
  functionName: "undo_bulk_track_edit",
  args: { requested_batch_id: string },
) => Promise<{
  data: { batch_id: string; restored_count: number } | null;
  error: { message?: string } | null;
}>;

function validationState(
  error: ZodError,
  locale: Awaited<ReturnType<typeof getCurrentLocale>>,
): TrackActionState {
  const rawFieldErrors = error.flatten()
    .fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors = Object.fromEntries(
    Object.entries(rawFieldErrors).map(([field, messages]) => [
      field,
      messages?.map((message) => translateKnown(locale, message)),
    ]),
  );
  return {
    fieldErrors,
    message: translate(locale, "Revisa los campos indicados."),
    status: "error",
  };
}

export async function createTrackAction(
  _previousState: TrackActionState,
  formData: FormData,
): Promise<TrackActionState> {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);

  let values: TrackFormValues;
  try {
    values = trackValuesFromFormData(formData);
  } catch (error) {
    if (error instanceof ZodError) return validationState(error, locale);
    return {
      message: translate(locale, "Los datos no son válidos."),
      status: "error",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .insert(toTrackInsert(values, user.id))
    .select("id")
    .single();

  if (error || !data) {
    return {
      message: translate(
        locale,
        "No se pudo guardar la canción. Inténtalo de nuevo.",
      ),
      status: "error",
    };
  }

  revalidatePath("/library");
  redirect(`/library/${data.id}`);
}

export async function updateTrackAction(
  _previousState: TrackActionState,
  formData: FormData,
): Promise<TrackActionState> {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const idResult = trackIdSchema.safeParse(formData.get("id"));
  const revisionResult = trackRevisionSchema.safeParse(formData.get("revision"));
  if (!idResult.success || !revisionResult.success) {
    return {
      message: translate(locale, "La canción indicada no es válida."),
      status: "error",
    };
  }

  let values: TrackFormValues;
  try {
    values = trackValuesFromFormData(formData);
  } catch (error) {
    if (error instanceof ZodError) return validationState(error, locale);
    return {
      message: translate(locale, "Los datos no son válidos."),
      status: "error",
    };
  }

  const supabase = await createClient();
  const { data: persisted, error: readError } = await supabase
    .from("tracks")
    .select("bpm, bpm_confidence, bpm_explanation, bpm_source, camelot_key, energy, energy_confidence, energy_source, genre, genre_analyzed_at_ms, genre_analyzer_id, genre_analyzer_version, genre_compatibility_key, genre_confidence, genre_raw_score, genre_source, key_confidence, key_explanation, key_source, musical_key, subgenre, subgenre_analyzed_at_ms, subgenre_analyzer_id, subgenre_analyzer_version, subgenre_compatibility_key, subgenre_confidence, subgenre_raw_score, subgenre_source")
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError || !persisted) {
    return {
      message: translate(locale, "No se pudo actualizar la canción."),
      status: "error",
    };
  }

  const patch = toTrackUpdate(
    values,
    persisted,
    maestEvidenceFromFormData(formData),
    nativeAnalysisEvidenceFromFormData(formData),
  );
  const rpc = supabase.rpc.bind(supabase) as unknown as UpdateTrackWithHistoryRpc;
  const { data, error } = await rpc("update_track_with_history", {
    expected_updated_at: revisionResult.data,
    requested_patch: patch,
    requested_track_id: idResult.data,
  });

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("Track changed after form loaded")) {
      return {
        message:
          locale === "en"
            ? "This track changed after you opened the form. Reload it and review the latest values before saving."
            : "Esta canción cambió después de abrir el formulario. Recárgala y revisa los valores actuales antes de guardar.",
        status: "error",
      };
    }
    return {
      message: translate(locale, "No se pudo actualizar la canción."),
      status: "error",
    };
  }

  revalidatePath("/library");
  revalidatePath(`/library/${data.track_id}`);
  redirect(`/library/${data.track_id}?updated=1`);
}

export async function undoTrackEditAction(formData: FormData) {
  await requireUser();
  const historyId = historyIdSchema.safeParse(formData.get("historyId"));
  const trackId = trackIdSchema.safeParse(formData.get("trackId"));
  if (!historyId.success || !trackId.success) {
    redirect("/library");
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UndoTrackEditRpc;
  const { data, error } = await rpc("undo_track_edit", {
    requested_history_id: historyId.data,
  });

  if (error || !data || data.track_id !== trackId.data) {
    const message = error?.message ?? "";
    const reason = message.includes("Track changed after history entry")
      ? "changed"
      : "failed";
    redirect(`/library/${trackId.data}?undoError=${reason}`);
  }

  revalidatePath("/library");
  revalidatePath(`/library/${data.track_id}`);
  redirect(`/library/${data.track_id}?undone=1`);
}

export async function deleteTrackAction(formData: FormData) {
  const user = await requireUser();
  const id = trackIdSchema.parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("tracks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new Error("No se pudo eliminar la canción.");
  }

  revalidatePath("/library");
  redirect("/library?deleted=1");
}

export async function deleteTracksAction(formData: FormData) {
  const user = await requireUser();
  const ids = trackIdsSchema.parse(formData.getAll("trackId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("tracks")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) {
    throw new Error("No se pudieron eliminar las canciones seleccionadas.");
  }

  revalidatePath("/library");
  redirect("/library?deleted=1");
}

function libraryReturnTo(formData: FormData) {
  const value = formData.get("returnTo");
  return typeof value === "string" &&
    value.startsWith("/library") &&
    !value.startsWith("//")
    ? value
    : "/library";
}

async function setTrackArchivedAt(formData: FormData, archivedAt: string | null) {
  const user = await requireUser();
  const id = trackIdSchema.parse(formData.get("id"));
  const returnTo = libraryReturnTo(formData);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .update({ archived_at: archivedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      archivedAt
        ? "No se pudo archivar la canción."
        : "No se pudo restaurar la canción.",
    );
  }

  revalidatePath("/library");
  revalidatePath(`/library/${id}`);
  revalidatePath("/crates");
  redirect(returnTo);
}

export async function archiveTrackAction(formData: FormData) {
  await setTrackArchivedAt(formData, new Date().toISOString());
}

export async function restoreTrackAction(formData: FormData) {
  await setTrackArchivedAt(formData, null);
}

function withLibraryStatus(
  returnTo: string,
  status: string,
  extra?: Record<string, string>,
) {
  const url = new URL(returnTo, "https://djorganizer.local");
  url.searchParams.set(status, "1");
  for (const [key, value] of Object.entries(extra ?? {})) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export async function bulkUpdateTracksAction(formData: FormData) {
  await requireUser();
  const returnTo = libraryReturnTo(formData);
  let change: ReturnType<typeof bulkTrackUpdateFromFormData>;

  try {
    change = bulkTrackUpdateFromFormData(formData);
  } catch {
    redirect(withLibraryStatus(returnTo, "bulkError"));
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as BulkUpdateTracksWithHistoryRpc;
  const { data, error } = await rpc("bulk_update_tracks_with_history", {
    requested_patch: change.update,
    requested_track_ids: change.trackIds,
  });

  if (error || !data) {
    redirect(withLibraryStatus(returnTo, "bulkError"));
  }

  revalidatePath("/library");
  redirect(
    withLibraryStatus(
      returnTo,
      "bulkUpdated",
      data.batch_id ? { bulkBatch: data.batch_id } : undefined,
    ),
  );
}

export async function undoBulkTrackEditAction(formData: FormData) {
  await requireUser();
  const returnTo = libraryReturnTo(formData);
  const batchId = historyBatchIdSchema.safeParse(formData.get("batchId"));
  if (!batchId.success) {
    redirect(withLibraryStatus(returnTo, "bulkUndoError"));
  }

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as UndoBulkTrackEditRpc;
  const { data, error } = await rpc("undo_bulk_track_edit", {
    requested_batch_id: batchId.data,
  });

  if (error || !data) {
    const reason = (error?.message ?? "").includes("changed after history entry")
      ? "changed"
      : "failed";
    redirect(
      withLibraryStatus(returnTo, "bulkUndoError", { bulkUndoReason: reason }),
    );
  }

  revalidatePath("/library");
  redirect(withLibraryStatus(returnTo, "bulkUndone"));
}
