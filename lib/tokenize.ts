/**
 * Deterministic word tokenizer.
 *
 * Every count in the app comes from this one function, so it is kept small,
 * rule-based and fully unit-tested. Rules:
 *  - A word starts with a letter or digit and continues with letters, digits
 *    or combining marks (so accented words like "café" stay whole).
 *  - Apostrophes and hyphens join word parts: "don't", "tracker's",
 *    "real-time", "co-founder" are one word each (same as Word / Google Docs).
 *  - Dotted abbreviations stay whole: "U.S.", "e.g.", "a.m.".
 *  - Matching is case-insensitive: "Tracker" and "tracker" share one key.
 */

export interface Token {
  /** Character offset of the first character in the source text. */
  start: number;
  /** Character offset just past the last character. */
  end: number;
  /** Exact text as written. */
  text: string;
  /** Normalised, lower-cased form used for counting. */
  key: string;
  /** False for pure numbers like "2024" or "3.5". */
  hasLetter: boolean;
  /**
   * True when punctuation or a line break separates this token from the
   * previous one. Repeated phrases never cross such a break.
   */
  breakBefore: boolean;
}

// Invisible characters that word processors put inside words.
const INVISIBLE_IN_WORD = '\\u00AD\\u200C\\u200D\\u2060';
const WORD_CHAR = `[\\p{L}\\p{N}\\p{M}${INVISIBLE_IN_WORD}]`;
const WORD_START = '[\\p{L}\\p{N}]';
const JOINER = "['\\u2019\\u2018\\u02BC\\-\\u2010\\u2011]";

const TOKEN_RE = new RegExp(
  `(?:\\p{L}\\.){2,}|${WORD_START}${WORD_CHAR}*(?:${JOINER}${WORD_START}${WORD_CHAR}*)*`,
  'gu',
);

const LETTER_RE = /\p{L}/u;
const SOFT_GAP_RE = /^[ \t\u00A0\u2000-\u200B\u202F\u205F\u3000]*$/;

export function normalizeKey(word: string): string {
  return word
    .normalize('NFKC')
    .replace(/[\u00AD\u200C\u200D\u2060]/g, '')
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/[\u2010\u2011]/g, '-')
    .toLowerCase();
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let prevEnd = 0;
  TOKEN_RE.lastIndex = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index!;
    const raw = m[0];
    const end = start + raw.length;
    const gap = text.slice(prevEnd, start);
    tokens.push({
      start,
      end,
      text: raw,
      key: normalizeKey(raw),
      hasLetter: LETTER_RE.test(raw),
      breakBefore: tokens.length === 0 || !SOFT_GAP_RE.test(gap),
    });
    prevEnd = end;
  }
  return tokens;
}
