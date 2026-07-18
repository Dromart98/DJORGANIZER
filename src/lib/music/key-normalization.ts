export type NormalizedMusicalKey = {
  camelotKey: string;
  musicalKey: string;
};

const canonicalByCamelot: Record<string, string> = {
  "1A": "G♯m",
  "1B": "B",
  "2A": "D♯m",
  "2B": "F♯",
  "3A": "A♯m",
  "3B": "D♭",
  "4A": "Fm",
  "4B": "A♭",
  "5A": "Cm",
  "5B": "E♭",
  "6A": "Gm",
  "6B": "B♭",
  "7A": "Dm",
  "7B": "F",
  "8A": "Am",
  "8B": "C",
  "9A": "Em",
  "9B": "G",
  "10A": "Bm",
  "10B": "D",
  "11A": "F♯m",
  "11B": "A",
  "12A": "C♯m",
  "12B": "E",
};

const aliases: Record<string, string> = {
  "abm": "1A",
  "g#m": "1A",
  "g#min": "1A",
  "g#minor": "1A",
  "b": "1B",
  "bmaj": "1B",
  "bmajor": "1B",
  "d#m": "2A",
  "ebm": "2A",
  "f#": "2B",
  "f#maj": "2B",
  "gb": "2B",
  "gbmaj": "2B",
  "a#m": "3A",
  "bbm": "3A",
  "c#": "3B",
  "c#maj": "3B",
  "db": "3B",
  "dbmaj": "3B",
  "fmin": "4A",
  "fm": "4A",
  "ab": "4B",
  "abmaj": "4B",
  "cmin": "5A",
  "cm": "5A",
  "d#": "5B",
  "eb": "5B",
  "ebmaj": "5B",
  "gmin": "6A",
  "gm": "6A",
  "a#": "6B",
  "bb": "6B",
  "bbmaj": "6B",
  "dmin": "7A",
  "dm": "7A",
  "f": "7B",
  "fmaj": "7B",
  "amin": "8A",
  "am": "8A",
  "c": "8B",
  "cmaj": "8B",
  "emin": "9A",
  "em": "9A",
  "g": "9B",
  "gmaj": "9B",
  "bmin": "10A",
  "bm": "10A",
  "d": "10B",
  "dmaj": "10B",
  "f#m": "11A",
  "gbm": "11A",
  "a": "11B",
  "amaj": "11B",
  "c#m": "12A",
  "dbm": "12A",
  "e": "12B",
  "emaj": "12B",
};

function normalizedToken(value: string) {
  return value
    .normalize("NFKC")
    .replaceAll("♯", "#")
    .replaceAll("♭", "b")
    .trim()
    .toLowerCase()
    .replaceAll("sharp", "#")
    .replaceAll("flat", "b")
    .replaceAll(/\s+/g, "")
    .replace("major", "maj")
    .replace("minor", "min")
    .replace(/min$/, "m")
    .replace(/maj$/, "");
}

export function normalizeMusicalKey(
  value: string | null | undefined,
): NormalizedMusicalKey | null {
  if (!value) return null;
  const token = normalizedToken(value);
  const directCamelot = token.toUpperCase();
  const camelotKey =
    canonicalByCamelot[directCamelot] !== undefined
      ? directCamelot
      : aliases[token];
  if (!camelotKey) return null;

  return {
    camelotKey,
    musicalKey: canonicalByCamelot[camelotKey],
  };
}
