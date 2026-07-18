import { z } from "zod";

export const TRACKS_PER_PAGE = 25;

const SORT_COLUMNS = {
  artist: "artist",
  bpm: "bpm",
  created: "created_at",
  duration: "duration_seconds",
  key: "musical_key",
  title: "title",
} as const;

export type TrackSort = keyof typeof SORT_COLUMNS;
export type TrackDirection = "asc" | "desc";

export type TrackQuery = {
  bpmMax?: number;
  bpmMin?: number;
  camelot?: string;
  direction: TrackDirection;
  energyMax?: number;
  energyMin?: number;
  genre?: string;
  key?: string;
  page: number;
  q?: string;
  rating?: number;
  sort: TrackSort;
};

const textValue = (maximum: number) =>
  z.preprocess(
    (value: unknown) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text ? text.slice(0, maximum) : undefined;
    },
    z.string().optional(),
  );

const optionalBoundedNumber = (minimum: number, maximum: number) =>
  z.preprocess(
    (value: unknown) => {
      if (typeof value !== "string" || value.trim() === "") {
        return undefined;
      }
      return Number(value);
    },
    z.number().min(minimum).max(maximum).optional(),
  );

const querySchema = z.object({
  bpmMax: optionalBoundedNumber(20, 300),
  bpmMin: optionalBoundedNumber(20, 300),
  camelot: textValue(3),
  direction: z.enum(["asc", "desc"]).catch("asc"),
  energyMax: optionalBoundedNumber(0, 100),
  energyMin: optionalBoundedNumber(0, 100),
  genre: textValue(120),
  key: textValue(16),
  page: z.coerce.number().int().positive().catch(1),
  q: textValue(120),
  rating: optionalBoundedNumber(0, 5),
  sort: z
    .enum(["artist", "bpm", "created", "duration", "key", "title"])
    .catch("created"),
});

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTrackQuery(searchParams: SearchParams): TrackQuery {
  const parsed = querySchema.parse({
    bpmMax: firstValue(searchParams.bpmMax),
    bpmMin: firstValue(searchParams.bpmMin),
    camelot: firstValue(searchParams.camelot),
    direction: firstValue(searchParams.direction),
    energyMax: firstValue(searchParams.energyMax),
    energyMin: firstValue(searchParams.energyMin),
    genre: firstValue(searchParams.genre),
    key: firstValue(searchParams.key),
    page: firstValue(searchParams.page),
    q: firstValue(searchParams.q),
    rating: firstValue(searchParams.rating),
    sort: firstValue(searchParams.sort),
  });

  return {
    ...parsed,
    bpmMax:
      parsed.bpmMin !== undefined && parsed.bpmMax !== undefined
        ? Math.max(parsed.bpmMin, parsed.bpmMax)
        : parsed.bpmMax,
    energyMax:
      parsed.energyMin !== undefined && parsed.energyMax !== undefined
        ? Math.max(parsed.energyMin, parsed.energyMax)
        : parsed.energyMax,
  };
}

export function databaseSortColumn(sort: TrackSort) {
  return SORT_COLUMNS[sort];
}

export function safeSearchTerm(value: string) {
  return value.replace(/[(),"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function queryToSearchParams(query: TrackQuery) {
  const params = new URLSearchParams();
  const entries: [string, string | number | undefined][] = [
    ["q", query.q],
    ["genre", query.genre],
    ["bpmMin", query.bpmMin],
    ["bpmMax", query.bpmMax],
    ["key", query.key],
    ["camelot", query.camelot],
    ["energyMin", query.energyMin],
    ["energyMax", query.energyMax],
    ["rating", query.rating],
    ["sort", query.sort],
    ["direction", query.direction],
    ["page", query.page],
  ];

  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  return params;
}

export function buildLibraryHref(
  query: TrackQuery,
  changes: Partial<TrackQuery>,
) {
  const nextQuery = { ...query, ...changes };
  const params = queryToSearchParams(nextQuery);
  return `/library${params.size ? `?${params.toString()}` : ""}`;
}
