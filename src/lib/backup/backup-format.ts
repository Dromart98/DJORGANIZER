export const BACKUP_VERSION = 1;

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
  if (
    value.product !== "DJOrganizer" ||
    value.version !== BACKUP_VERSION ||
    !value.data ||
    !Array.isArray(value.data.tracks) ||
    !Array.isArray(value.data.crates) ||
    !Array.isArray(value.data.crateTracks) ||
    !Array.isArray(value.data.tags) ||
    !Array.isArray(value.data.trackTags)
  ) {
    throw new Error("La copia de seguridad no es compatible.");
  }
  return value as DjOrganizerBackup;
}
