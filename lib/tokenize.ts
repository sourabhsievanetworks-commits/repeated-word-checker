/**
 * Deterministic word tokenizer.
 *
 * Every count in the app comes from this one function, so it is kept small,
 * rule-based and fully unit-tested. Rules:
 *  - A word starts with a letter or digit and continues with letters, digits
 *    or combining marks (so accented words like "café" stay whole).
 *  - Apostrophes join word parts: "don't" and "tracker's" are one word each.
 *  - Hyphenated words ("real-time", "GPS-enabled") are split into their parts
 *    by default so every part is counted; with splitHyphens off they stay
 *    whole, like Microsoft Word counts them.
 *  - Dotted abbreviations stay whole: "U.S.", "e.g.", "a.m.".
 *  - Decimal and grouped numbers stay whole: "129.99", "1.5", "2,000".
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
const APOSTROPHE = "'\\u2019\\u2018\\u02BC";
const HYPHEN = '\\-\\u2010\\u2011';

const tokenRe = (joiner: string) =>
  new RegExp(`(?:\\p{L}\\.){2,}|\\p{N}+(?:[.,]\\p{N}+)+(?![\\p{L}\\p{M}])|${WORD_START}${WORD_CHAR}*(?:[${joiner}]${WORD_START}${WORD_CHAR}*)*`, 'gu');

const TOKEN_RE_SPLIT = tokenRe(APOSTROPHE);
const TOKEN_RE_WHOLE = tokenRe(APOSTROPHE + HYPHEN);

const LETTER_RE = /\p{L}/u;
// "GPS-enabled": with hyphens split, the parts still belong to one phrase.
const HYPHEN_GAP_RE = /^[-\u2010\u2011]$/;
const SOFT_GAP_RE = /^[ \t\u00A0\u2000-\u200B\u202F\u205F\u3000]*$/;

export function normalizeKey(word: string): string {
  return word
    .normalize('NFKC')
    .replace(/[\u00AD\u200C\u200D\u2060]/g, '')
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/[\u2010\u2011]/g, '-')
    .toLowerCase();
}

export interface TokenizeOptions {
  /** Count "GPS-enabled" as "GPS" + "enabled" (default) instead of one word. */
  splitHyphens?: boolean;
}

export function tokenize(text: string, { splitHyphens = true }: TokenizeOptions = {}): Token[] {
  const tokens: Token[] = [];
  let prevEnd = 0;
  const re = splitHyphens ? TOKEN_RE_SPLIT : TOKEN_RE_WHOLE;
  for (const m of text.matchAll(re)) {
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
      breakBefore: tokens.length === 0 || !(SOFT_GAP_RE.test(gap) || (splitHyphens && HYPHEN_GAP_RE.test(gap))),
    });
    prevEnd = end;
  }
  return tokens;
}

// "it's", "let's" ... are contractions, not possessives.
const NOT_POSSESSIVE = new Set([
  "it's", "that's", "there's", "here's", "what's", "who's", "where's", "when's",
  "why's", "how's", "he's", "she's", "let's",
]);

/** "tracker's" -> "tracker", so possessives count toward the word itself. */
export function stripPossessive(key: string): string {
  return key.endsWith("'s") && key.length > 2 && !NOT_POSSESSIVE.has(key) ? key.slice(0, -2) : key;
}

/**
 * Letters and digits that are not inside any token. The tokenizer is built so
 * this is always empty; the app shows it as a self-check.
 */
export function uncountedCharacters(text: string, tokens: Token[]): string[] {
  const missed: string[] = [];
  let at = 0;
  for (const t of [...tokens, { start: text.length, end: text.length }]) {
    for (const ch of text.slice(at, t.start)) if (/[\p{L}\p{N}]/u.test(ch)) missed.push(ch);
    at = t.end;
  }
  return missed;
}
