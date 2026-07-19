export type ScanReviewFilter = "all" | "duplicates" | "metadata-errors";

export interface ScannedAudioFile {
  name: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  metadataRead: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  durationSeconds: number | null;
  bpm: number | null;
  musicalKey: string | null;
  duplicateGroup: string | null;
}

export const DESKTOP_SCAN_PAGE_SIZE = 25;

export function filterScannedTracks(
  tracks: readonly ScannedAudioFile[],
  query: string,
  filter: ScanReviewFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es-ES");

  return tracks.filter((track) => {
    if (filter === "duplicates" && !track.duplicateGroup) return false;
    if (filter === "metadata-errors" && track.metadataRead) return false;
    if (!normalizedQuery) return true;

    return [
      track.name,
      track.relativePath,
      track.title,
      track.artist,
      track.album,
      track.genre,
      track.musicalKey,
      track.bpm?.toString(),
      track.duplicateGroup,
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n")
      .toLocaleLowerCase("es-ES")
      .includes(normalizedQuery);
  });
}

export function paginateScannedTracks(
  tracks: readonly ScannedAudioFile[],
  requestedPage: number,
  requestedPageSize = DESKTOP_SCAN_PAGE_SIZE,
) {
  const pageSize =
    Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? requestedPageSize
      : DESKTOP_SCAN_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(tracks.length / pageSize));
  const numericPage = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1;
  const page = Math.min(Math.max(numericPage, 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: tracks.slice(start, start + pageSize),
    page,
    pageSize,
    total: tracks.length,
    totalPages,
  };
}
