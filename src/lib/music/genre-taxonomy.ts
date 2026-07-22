/** Stable internal vocabulary for comparable genre-classification evaluations. */
export const GENRE_TAXONOMY_VERSION = "djorganizer-genre-v1";

export const DEFAULT_GENRE_TAXONOMY = [
  "Ambient",
  "Bass",
  "Breaks",
  "Deep House",
  "Disco",
  "Drum & Bass",
  "Electro",
  "House",
  "Melodic House & Techno",
  "Organic House",
  "Progressive House",
  "Tech House",
  "Techno",
  "Trance",
] as const;

export type DefaultGenre = (typeof DEFAULT_GENRE_TAXONOMY)[number];
