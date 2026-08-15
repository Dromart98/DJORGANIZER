export const METADATA_CLEANUP_FIELDS = [
  "title",
  "artist",
  "album",
  "genre",
  "subgenre",
] as const;

export type MetadataCleanupField = (typeof METADATA_CLEANUP_FIELDS)[number];

export type MetadataCleanupTrack = {
  album: string | null;
  artist: string | null;
  genre: string | null;
  id: string;
  subgenre: string | null;
  title: string;
};

export type MetadataCleanupReason =
  | "case"
  | "genre-alias"
  | "separator-spacing"
  | "track-number"
  | "url"
  | "whitespace";

export type MetadataCleanupProposal = {
  currentValue: string;
  field: MetadataCleanupField;
  proposedValue: string;
  reasons: MetadataCleanupReason[];
  trackId: string;
  trackTitle: string;
};

const GENRE_ALIASES = new Map<string, string>([
  ["afro house", "Afro House"],
  ["ambient", "Ambient"],
  ["breakbeat", "Breakbeat"],
  ["d&b", "Drum & Bass"],
  ["deep house", "Deep House"],
  ["disco", "Disco"],
  ["dnb", "Drum & Bass"],
  ["drum & bass", "Drum & Bass"],
  ["drum and bass", "Drum & Bass"],
  ["drum n bass", "Drum & Bass"],
  ["dubstep", "Dubstep"],
  ["electro", "Electro"],
  ["funk", "Funk"],
  ["garage", "Garage"],
  ["hard techno", "Hard Techno"],
  ["hip hop", "Hip-Hop"],
  ["hip-hop", "Hip-Hop"],
  ["house", "House"],
  ["melodic techno", "Melodic Techno"],
  ["minimal techno", "Minimal Techno"],
  ["neoperreo", "Neoperreo"],
  ["progressive house", "Progressive House"],
  ["r&b", "R&B"],
  ["reggaeton", "Reggaeton"],
  ["rnb", "R&B"],
  ["soul", "Soul"],
  ["tech house", "Tech House"],
  ["techno", "Techno"],
  ["trance", "Trance"],
]);

const CASE_EXCEPTIONS = new Map<string, string>([
  ["dj", "DJ"],
  ["mc", "MC"],
  ["r&b", "R&B"],
]);

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripResidualUrls(value: string) {
  return value
    .replace(/(?:^|\s)[([{<]*(?:https?:\/\/|www\.)\S+[\])}>.,;:]*/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrackNumberPrefix(value: string) {
  return value.replace(/^\s*\d{1,3}\s*(?:[-._)]\s*)+/, "").trim();
}

function normalizeSeparatorSpacing(value: string) {
  return value
    .replace(/\s+([/&])\s*/g, " $1 ")
    .replace(/\s*([/&])\s+/g, " $1 ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLetters(value: string) {
  return /\p{L}/u.test(value);
}

function isUniformCase(value: string) {
  if (!hasLetters(value)) return false;
  return value === value.toLocaleLowerCase() || value === value.toLocaleUpperCase();
}

function hasCompactSeparatorToken(value: string) {
  return /\S[/&]\S/u.test(value);
}

function titleCaseWord(word: string, index: number) {
  const lower = word.toLocaleLowerCase();
  const exception = CASE_EXCEPTIONS.get(lower);
  if (exception) return exception;
  if (!/\p{L}/u.test(lower)) return word;
  if (index > 0 && ["and", "de", "del", "la", "las", "los", "the", "y"].includes(lower)) {
    return lower;
  }
  return lower.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase());
}

function normalizeUniformCase(value: string) {
  if (!isUniformCase(value) || hasCompactSeparatorToken(value)) return value;
  return value
    .split(" ")
    .map((word, index) => titleCaseWord(word, index))
    .join(" ");
}

function normalizeGenre(value: string) {
  return GENRE_ALIASES.get(value.toLocaleLowerCase()) ?? normalizeUniformCase(value);
}

export function proposeMetadataCleanup(
  field: MetadataCleanupField,
  currentValue: string | null,
): { proposedValue: string; reasons: MetadataCleanupReason[] } | null {
  if (currentValue === null || currentValue.trim() === "") return null;

  let next = currentValue;
  const reasons: MetadataCleanupReason[] = [];

  const whitespace = normalizeWhitespace(next);
  if (whitespace !== next) {
    next = whitespace;
    reasons.push("whitespace");
  }

  const withoutUrls = stripResidualUrls(next);
  if (withoutUrls && withoutUrls !== next) {
    next = withoutUrls;
    reasons.push("url");
  }

  if (field === "title") {
    const withoutTrackNumber = stripTrackNumberPrefix(next);
    if (withoutTrackNumber && withoutTrackNumber !== next) {
      next = withoutTrackNumber;
      reasons.push("track-number");
    }
  }

  const separatorSpacing = normalizeSeparatorSpacing(next);
  if (separatorSpacing !== next) {
    next = separatorSpacing;
    reasons.push("separator-spacing");
  }

  const cased = field === "genre" ? normalizeGenre(next) : normalizeUniformCase(next);
  if (cased !== next) {
    if (field === "genre" && GENRE_ALIASES.get(next.toLocaleLowerCase()) === cased) {
      reasons.push("genre-alias");
    } else {
      reasons.push("case");
    }
    next = cased;
  }

  next = normalizeWhitespace(next);
  if (!next || next === currentValue) return null;

  return { proposedValue: next, reasons: [...new Set(reasons)] };
}

export function buildMetadataCleanupProposals(
  tracks: readonly MetadataCleanupTrack[],
): MetadataCleanupProposal[] {
  const proposals: MetadataCleanupProposal[] = [];
  for (const track of tracks) {
    for (const field of METADATA_CLEANUP_FIELDS) {
      const currentValue = track[field];
      const proposal = proposeMetadataCleanup(field, currentValue);
      if (!proposal || currentValue === null) continue;
      proposals.push({
        currentValue,
        field,
        proposedValue: proposal.proposedValue,
        reasons: proposal.reasons,
        trackId: track.id,
        trackTitle: track.title,
      });
    }
  }
  return proposals;
}
