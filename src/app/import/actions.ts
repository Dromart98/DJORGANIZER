"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import {
  importBatchSchema,
  type ImportTrackInput,
} from "@/lib/import/import-schema";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";

export type ImportResult = {
  client_id: string;
  message?: string;
  status: "saved" | "error";
  track_id?: string;
};

export type ImportBatchResult = {
  message?: string;
  results: ImportResult[];
};

function toTrackInsert(
  track: ImportTrackInput,
  userId: string,
): TablesInsert<"tracks"> {
  return {
    album: track.album,
    artist: track.artist,
    bpm: track.bpm,
    duration_seconds: track.duration_seconds,
    file_name: track.file_name,
    file_size: track.file_size,
    file_type: track.file_type,
    genre: track.genre,
    musical_key: track.musical_key,
    release_year: track.release_year,
    title: track.title,
    user_id: userId,
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
  const results = await Promise.all(
    parsed.data.map(async (track: ImportTrackInput): Promise<ImportResult> => {
      const { data, error } = await supabase
        .from("tracks")
        .insert(toTrackInsert(track, user.id))
        .select("id")
        .single();

      if (error || !data) {
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

