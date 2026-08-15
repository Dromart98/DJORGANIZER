"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

const repairTrackIdsSchema = z.array(z.string().uuid()).min(1).max(25);

export type LostTrackRepairEvidence = {
  album: string | null;
  artist: string | null;
  durationSeconds: number | null;
  fileFingerprint: string;
  fileSize: number;
  genre: string | null;
  title: string;
  trackId: string;
};

export type LostTrackRepairEvidenceResult = {
  tracks: LostTrackRepairEvidence[];
  unresolvedTrackIds: string[];
};

export async function getLostTrackRepairEvidenceAction(
  input: unknown,
): Promise<LostTrackRepairEvidenceResult> {
  const user = await requireUser();
  const parsed = repairTrackIdsSchema.safeParse(input);
  if (!parsed.success) return { tracks: [], unresolvedTrackIds: [] };

  const requestedIds = [...new Set(parsed.data)];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tracks")
    .select(
      "id, title, artist, album, genre, duration_seconds, file_fingerprint, file_size",
    )
    .eq("user_id", user.id)
    .in("id", requestedIds);

  if (error) throw new Error("No se pudieron preparar las referencias perdidas.");

  const tracks = (data ?? []).flatMap((track) => {
    const validFingerprint =
      typeof track.file_fingerprint === "string" &&
      /^[a-f0-9]{64}$/i.test(track.file_fingerprint);
    const validSize =
      track.file_size !== null &&
      Number.isSafeInteger(track.file_size) &&
      track.file_size >= 0;
    const validDuration =
      track.duration_seconds === null ||
      (Number.isFinite(track.duration_seconds) &&
        track.duration_seconds > 0 &&
        track.duration_seconds <= 86_400);
    if (!validFingerprint || !validSize || !validDuration) return [];

    return [
      {
        album: track.album,
        artist: track.artist,
        durationSeconds: track.duration_seconds,
        fileFingerprint: track.file_fingerprint!.toLowerCase(),
        fileSize: track.file_size!,
        genre: track.genre,
        title: track.title,
        trackId: track.id,
      },
    ];
  });
  const resolvedIds = new Set(tracks.map((track) => track.trackId));

  return {
    tracks,
    unresolvedTrackIds: requestedIds.filter((trackId) => !resolvedIds.has(trackId)),
  };
}
