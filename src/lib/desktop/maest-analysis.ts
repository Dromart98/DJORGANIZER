import type { FieldAnalysis, MusicAnalysisResult } from "@/lib/music/analysis-contract";

export const DESKTOP_MAEST_ANALYZER = {
  id: "djorganizer.desktop.genre.maest",
  version: "discogs-maest-30s-pw-519l@1",
} as const;
export const DESKTOP_MAEST_COMPATIBILITY_KEY = "maest-519l|mel-16000-1876x96-f32|v1";

type DesktopTextField = Omit<FieldAnalysis<"genre">, "field" | "confidence"> & {
  field: "genre" | "subgenre";
  score?: number;
};

export type DesktopMaestResult = {
  analyzer: typeof DESKTOP_MAEST_ANALYZER;
  compatibilityKey: typeof DESKTOP_MAEST_COMPATIBILITY_KEY;
  genre: DesktopTextField;
  subgenre: DesktopTextField;
  partialErrors: Array<{ code: string; message: string }>;
};

/** Converts a read-only desktop proposal; this function deliberately has no persistence dependency. */
export function toMusicAnalysisResult(result: DesktopMaestResult): MusicAnalysisResult {
  const convert = (field: DesktopTextField): FieldAnalysis<"genre"> | FieldAnalysis<"subgenre"> => ({
    field: field.field,
    status: field.status,
    source: "automatic",
    ...(field.proposedValue === undefined ? {} : { proposedValue: field.proposedValue }),
    ...(field.error === undefined ? {} : { error: field.error }),
    ...(field.analyzedAt === undefined ? {} : { analyzedAt: field.analyzedAt }),
  }) as FieldAnalysis<"genre"> | FieldAnalysis<"subgenre">;
  return {
    analyzer: result.analyzer,
    compatibilityKey: result.compatibilityKey,
    fields: { genre: convert(result.genre) as FieldAnalysis<"genre">, subgenre: convert(result.subgenre) as FieldAnalysis<"subgenre"> },
  };
}
