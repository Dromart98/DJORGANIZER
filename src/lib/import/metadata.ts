import type { ImportTrackInput } from "@/lib/import/import-schema";

export type AudioMetadataLike = {
  common: {
    album?: string;
    artist?: string;
    bpm?: number;
    genre?: string[];
    key?: string;
    title?: string;
    year?: number;
  };
  format: {
    duration?: number;
  };
};

export type LocalAudioFile = {
  name: string;
  size: number;
  type: string;
};

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function finiteNumber(value: number | undefined, precision: number) {
  if (value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function titleFromFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || fileName;
}

export function metadataToImportTrack(
  metadata: AudioMetadataLike,
  file: LocalAudioFile,
  clientId: string,
): ImportTrackInput {
  return {
    album: optionalText(metadata.common.album),
    artist: metadata.common.artist?.trim() ?? "",
    bpm: finiteNumber(metadata.common.bpm, 2),
    client_id: clientId,
    duration_seconds: finiteNumber(metadata.format.duration, 3),
    file_name: file.name,
    file_size: file.size,
    file_type: file.type || "application/octet-stream",
    genre: optionalText(metadata.common.genre?.[0]),
    musical_key: optionalText(metadata.common.key),
    release_year: metadata.common.year ?? null,
    title:
      optionalText(metadata.common.title) ?? titleFromFileName(file.name),
  };
}

