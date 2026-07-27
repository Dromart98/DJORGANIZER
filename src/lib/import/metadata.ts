import type { ImportTrackInput } from "@/lib/import/import-schema";
import { inferVersionType } from "@/lib/audio/acoustic-similarity";

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
  fingerprint: string,
): ImportTrackInput {
  const title =
    optionalText(metadata.common.title) ?? titleFromFileName(file.name);
  const bpm = finiteNumber(metadata.common.bpm, 2);
  const musicalKey = optionalText(metadata.common.key);
  return {
    acoustic_fingerprint: null,
    album: optionalText(metadata.common.album),
    artist: optionalText(metadata.common.artist),
    bpm,
    bpm_confidence: null,
    bpm_explanation: bpm ? "Leído de las etiquetas del archivo." : null,
    bpm_source: bpm ? "metadata" : null,
    client_id: clientId,
    duration_seconds: finiteNumber(metadata.format.duration, 3),
    energy: null,
    energy_confidence: null,
    energy_source: null,
    file_fingerprint: fingerprint,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type || "application/octet-stream",
    genre: optionalText(metadata.common.genre?.[0]),
    genre_confidence: null,
    genre_source: metadata.common.genre?.[0] ? "metadata" : null,
    subgenre: null,
    subgenre_confidence: null,
    subgenre_source: null,
    key_confidence: null,
    key_explanation: musicalKey ? "Leída de las etiquetas del archivo." : null,
    key_source: musicalKey ? "metadata" : null,
    musical_key: musicalKey,
    release_year: metadata.common.year ?? null,
    title,
    version_type: inferVersionType(title),
  };
}
