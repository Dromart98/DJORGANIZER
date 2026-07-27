export const BACKUP_VERSION = 2;

export type DjOrganizerBackup = {
  createdAt: string;
  data: {
    crateTracks: unknown[];
    crates: unknown[];
    tags: unknown[];
    trackTags: unknown[];
    tracks: unknown[];
  };
  product: "DJOrganizer";
  version: typeof BACKUP_VERSION;
};

export function createBackup(
  data: DjOrganizerBackup["data"],
  now = new Date(),
): DjOrganizerBackup {
  return {
    createdAt: now.toISOString(),
    data,
    product: "DJOrganizer",
    version: BACKUP_VERSION,
  };
}
export function parseBackup(input: string): DjOrganizerBackup {
  const value = JSON.parse(input) as Partial<DjOrganizerBackup>;
  const parsedVersion = (value as { version?: number }).version;
  if (
    value.product !== "DJOrganizer" ||
    (parsedVersion !== BACKUP_VERSION && parsedVersion !== 1) ||
    !value.data ||
    !Array.isArray(value.data.tracks) ||
    !Array.isArray(value.data.crates) ||
    !Array.isArray(value.data.crateTracks) ||
    !Array.isArray(value.data.tags) ||
    !Array.isArray(value.data.trackTags)
  ) {
    throw new Error("La copia de seguridad no es compatible.");
  }
  if (parsedVersion === 1) {
    value.data.tracks = value.data.tracks.map((track) => {
      if (!track || typeof track !== "object") return track;
      const row = { ...(track as Record<string, unknown>) };
      if (typeof row.energy === "number") {
        row.energy = Math.max(0, Math.min(10, Math.round(row.energy / 10)));
        row.energy_source = "unknown";
        row.energy_confidence = null;
      }
      row.subgenre ??= null;
      row.subgenre_source ??= null;
      row.subgenre_confidence ??= null;
      return row;
    });
    value.version = BACKUP_VERSION;
  }
  return value as DjOrganizerBackup;
}
