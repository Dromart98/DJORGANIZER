export type Track = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  bpm: number;
  key: string;
  camelot: string;
  durationSeconds: number;
  energy: number;
  tags: readonly string[];
};

export type TrackSortKey = "title" | "artist" | "genre" | "bpm" | "key" | "camelot" | "durationSeconds";
export type SortDirection = "asc" | "desc";

