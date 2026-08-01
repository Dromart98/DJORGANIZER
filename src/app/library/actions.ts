"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/user";
import { translate, translateKnown } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";
import { bulkTrackUpdateFromFormData } from "@/lib/library/bulk-track-update";
import {
  toTrackInsert,
  toTrackUpdate,
  maestEvidenceFromFormData,
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
  if (!idResult.success) {
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
  const { data, error } = await supabase
    .from("tracks")
    .update(toTrackUpdate(values, persisted, maestEvidenceFromFormData(formData)))
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return {
      message: translate(locale, "No se pudo actualizar la canción."),
      status: "error",
    };
  }

  revalidatePath("/library");
  revalidatePath(`/library/${data.id}`);
  redirect(`/library/${data.id}?updated=1`);
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

function withLibraryStatus(returnTo: string, status: string) {
  const url = new URL(returnTo, "https://djorganizer.local");
  url.searchParams.set(status, "1");
  return `${url.pathname}${url.search}`;
}

export async function bulkUpdateTracksAction(formData: FormData) {
  const user = await requireUser();
  const returnTo = libraryReturnTo(formData);
  let change: ReturnType<typeof bulkTrackUpdateFromFormData>;

  try {
    change = bulkTrackUpdateFromFormData(formData);
  } catch {
    redirect(withLibraryStatus(returnTo, "bulkError"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tracks")
    .update(change.update)
    .eq("user_id", user.id)
    .in("id", change.trackIds);

  if (error) {
    redirect(withLibraryStatus(returnTo, "bulkError"));
  }

  revalidatePath("/library");
  redirect(withLibraryStatus(returnTo, "bulkUpdated"));
}
