"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/user";
import { createBackup, parseBackup } from "@/lib/backup/backup-format";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";

type RestoreResult = { message: string; ok: boolean };
const BACKUP_ROW_LIMIT = 20_000;
const BACKUP_BYTE_LIMIT = 50_000_000;
const PAGE_SIZE = 500;

type PageResult<T> = {
  data: T[] | null;
  error: { code?: string; message?: string } | null;
};

async function collectBackupRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
) {
  const rows: T[] = [];
  while (rows.length <= BACKUP_ROW_LIMIT) {
    const { data, error } = await loadPage(
      rows.length,
      rows.length + PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.code ?? error.message ?? "Backup query");
    const page = data ?? [];
    rows.push(...page);
    if (rows.length > BACKUP_ROW_LIMIT) {
      throw new Error("La biblioteca supera el límite de la copia.");
    }
    if (page.length < PAGE_SIZE) return rows;
  }
  return rows;
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
}

function pick(
  row: Record<string, unknown>,
  keys: readonly string[],
  userId: string,
) {
  const result: Record<string, unknown> = { user_id: userId };
  for (const key of keys) {
    if (key in row) result[key] = row[key];
  }
  return result;
}

function batches<T>(rows: readonly T[], size = PAGE_SIZE) {
  return Array.from(
    { length: Math.ceil(rows.length / size) },
    (_, index) => rows.slice(index * size, (index + 1) * size),
  );
}

function sortCratesForRestore(rows: TablesInsert<"crates">[]) {
  const pending = new Map(
    rows.flatMap((row) => (row.id ? [[row.id, row] as const] : [])),
  );
  const ordered = rows.filter((row) => !row.id);
  while (pending.size) {
    const ready = [...pending.values()].filter(
      (row) => !row.parent_id || !pending.has(row.parent_id),
    );
    if (!ready.length) {
      throw new Error("La copia contiene una jerarquía circular.");
    }
    for (const row of ready) {
      ordered.push(row);
      if (row.id) pending.delete(row.id);
    }
  }
  return ordered;
}

export async function createBackupAction() {
  const user = await requireUser();
  const supabase = await createClient();
  try {
    const [tracks, crates, crateTracks, tags, trackTags] = await Promise.all([
      collectBackupRows((from, to) =>
        supabase
          .from("tracks")
          .select("*")
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      ),
      collectBackupRows((from, to) =>
        supabase
          .from("crates")
          .select("*")
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      ),
      collectBackupRows((from, to) =>
        supabase
          .from("crate_tracks")
          .select("*")
          .eq("user_id", user.id)
          .order("crate_id")
          .order("track_id")
          .range(from, to),
      ),
      collectBackupRows((from, to) =>
        supabase
          .from("tags")
          .select("*")
          .eq("user_id", user.id)
          .order("id")
          .range(from, to),
      ),
      collectBackupRows((from, to) =>
        supabase
          .from("track_tags")
          .select("*")
          .eq("user_id", user.id)
          .order("track_id")
          .order("tag_id")
          .range(from, to),
      ),
    ]);
    const serialized = JSON.stringify(
      createBackup({ crateTracks, crates, tags, trackTags, tracks }),
      null,
      2,
    );
    if (new Blob([serialized]).size > BACKUP_BYTE_LIMIT) {
      throw new Error("La copia supera 50 MB.");
    }
    return serialized;
  } catch (error) {
    console.error(
      "Backup creation failed",
      error instanceof Error ? error.message : "unknown",
    );
    throw new Error("No se pudo crear una copia completa.");
  }
}

export async function restoreBackupAction(
  input: string,
  confirmed: boolean,
): Promise<RestoreResult> {
  const user = await requireUser();
  if (!confirmed || new Blob([input]).size > BACKUP_BYTE_LIMIT) {
    return { message: "La restauración no fue confirmada.", ok: false };
  }
  let backup;
  try {
    backup = parseBackup(input);
  } catch {
    return { message: "La copia de seguridad no es compatible.", ok: false };
  }
  if (
    Object.values(backup.data).some(
      (rows) => rows.length > BACKUP_ROW_LIMIT,
    )
  ) {
    return { message: "La copia supera el límite de seguridad.", ok: false };
  }

  const tracks = records(backup.data.tracks).map((row) =>
    pick(
      row,
      [
        "acoustic_fingerprint",
        "album",
        "analysis_status",
        "artist",
        "artwork_url",
        "bpm",
        "bpm_confidence",
        "bpm_explanation",
        "bpm_source",
        "camelot_key",
        "comments",
        "created_at",
        "duration_seconds",
        "energy",
        "energy_confidence",
        "energy_source",
        "file_fingerprint",
        "file_name",
        "file_size",
        "file_type",
        "genre",
        "genre_confidence",
        "genre_source",
        "subgenre",
        "subgenre_confidence",
        "subgenre_source",
        "id",
        "key_confidence",
        "key_explanation",
        "key_source",
        "musical_key",
        "rating",
        "release_year",
        "title",
        "updated_at",
        "version_type",
      ],
      user.id,
    ),
  ) as TablesInsert<"tracks">[];
  let crates: TablesInsert<"crates">[];
  try {
    crates = sortCratesForRestore(
      records(backup.data.crates).map((row) =>
        pick(
          row,
          [
            "created_at",
            "description",
            "id",
            "name",
            "parent_id",
            "updated_at",
          ],
          user.id,
        ),
      ) as TablesInsert<"crates">[],
    );
  } catch {
    return {
      message: "La copia contiene una jerarquía de crates no válida.",
      ok: false,
    };
  }
  const tags = records(backup.data.tags).map((row) =>
    pick(row, ["created_at", "id", "name", "updated_at"], user.id),
  ) as TablesInsert<"tags">[];
  const crateTracks = records(backup.data.crateTracks).map((row) =>
    pick(
      row,
      ["crate_id", "created_at", "position", "track_id"],
      user.id,
    ),
  ) as TablesInsert<"crate_tracks">[];
  const trackTags = records(backup.data.trackTags).map((row) =>
    pick(row, ["created_at", "tag_id", "track_id"], user.id),
  ) as TablesInsert<"track_tags">[];

  const supabase = await createClient();
  const operations: Array<() => Promise<{ code?: string } | null>> = [
    async () => {
      for (const batch of batches(tracks)) {
        const { error } = await supabase
          .from("tracks")
          .upsert(batch, { onConflict: "id" });
        if (error) return error;
      }
      return null;
    },
    async () => {
      for (const batch of batches(crates)) {
        const { error } = await supabase
          .from("crates")
          .upsert(batch, { onConflict: "id" });
        if (error) return error;
      }
      return null;
    },
    async () => {
      for (const batch of batches(tags)) {
        const { error } = await supabase
          .from("tags")
          .upsert(batch, { onConflict: "id" });
        if (error) return error;
      }
      return null;
    },
    async () => {
      for (const batch of batches(crateTracks)) {
        const { error } = await supabase
          .from("crate_tracks")
          .upsert(batch, { onConflict: "crate_id,track_id" });
        if (error) return error;
      }
      return null;
    },
    async () => {
      for (const batch of batches(trackTags)) {
        const { error } = await supabase
          .from("track_tags")
          .upsert(batch, { onConflict: "track_id,tag_id" });
        if (error) return error;
      }
      return null;
    },
  ];
  for (const [index, operation] of operations.entries()) {
    const rows = [tracks, crates, tags, crateTracks, trackTags][index];
    if (!rows.length) continue;
    const error = await operation();
    if (error) {
      console.error("Backup restore failed", error.code);
      return {
        message:
          "La restauración se detuvo al encontrar datos incompatibles. Los elementos ya restaurados se conservaron.",
        ok: false,
      };
    }
  }
  revalidatePath("/library");
  revalidatePath("/crates");
  return {
    message: `Copia restaurada: ${tracks.length} pistas y ${crates.length} crates.`,
    ok: true,
  };
}
