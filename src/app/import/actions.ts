"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
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

function toTrackInsert(
  track: ImportTrackInput,
  userId: string,
): TablesInsert<"tracks"> {
  const normalizedKey = normalizeMusicalKey(track.musical_key);
  return {
    album: track.album,
    artist: track.artist,
    bpm: track.bpm,
    duration_seconds: track.duration_seconds,
    camelot_key: normalizedKey?.camelotKey ?? null,
    file_fingerprint: track.file_fingerprint,
    file_name: track.file_name,
    file_size: track.file_size,
    file_type: track.file_type,
    genre: track.genre,
    musical_key: normalizedKey?.musicalKey ?? track.musical_key,
    release_year: track.release_year,
    title: track.title,
    user_id: userId,
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
