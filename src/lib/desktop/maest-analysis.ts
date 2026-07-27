import type { AnalysisStatus, FieldAnalysis, MusicAnalysisResult } from "@/lib/music/analysis-contract";

export const DESKTOP_MAEST_ANALYZER = {
  id: "djorganizer.desktop.genre.maest",
  version: "discogs-maest-30s-pw-519l@2",
} as const;
export const DESKTOP_MAEST_COMPATIBILITY_KEY = "maest-519l|mel-16000-1876x96-f32|v2";

type DesktopTextField<K extends "genre" | "subgenre"> = {
  field: K;
  status: AnalysisStatus;
  source: "automatic";
  proposedValue?: string | null;
  score?: number | null;
  error?: { code: string; message: string } | null;
  analyzedAt?: string | null;
};

export type DesktopMaestResult = {
  analyzer: typeof DESKTOP_MAEST_ANALYZER;
  compatibilityKey: typeof DESKTOP_MAEST_COMPATIBILITY_KEY;
  genre: DesktopTextField<"genre">;
  subgenre: DesktopTextField<"subgenre">;
  partialErrors: Array<{ code: string; message: string }>;
};

function convertTextField<K extends "genre" | "subgenre">(
  field: DesktopTextField<K>,
): FieldAnalysis<K> {
  return {
    field: field.field,
    status: field.status,
    source: "automatic",
    ...(field.proposedValue == null ? {} : { proposedValue: field.proposedValue }),
    ...(field.error == null ? {} : { error: field.error }),
    ...(field.analyzedAt == null ? {} : { analyzedAt: field.analyzedAt }),
  };
}

/** Converts a read-only desktop proposal; this function deliberately has no persistence dependency. */
export function toMusicAnalysisResult(result: DesktopMaestResult): MusicAnalysisResult {
  return {
    analyzer: result.analyzer,
    compatibilityKey: result.compatibilityKey,
    fields: {
      genre: convertTextField(result.genre),
      subgenre: convertTextField(result.subgenre),
    },
  };
}
