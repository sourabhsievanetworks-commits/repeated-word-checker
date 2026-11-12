/**
 * Deterministic word tokenizer.
 *
 * Every count in the app comes from this one function, so it is rule-based
 * (no model, no guessing) and fully unit-tested. Rules:
 *  - A word starts with a letter or digit and continues with letters, digits
 *    or combining marks (so accented words like "café" stay whole).
 *  - Apostrophes join word parts: "don't" and "tracker's" are one word each.
 *  - Hyphenated words are split into their parts so every part is counted:
 *    "GPS-enabled" = "GPS" + "enabled", "real-time" = "real" + "time".
 *    They stay whole when a part is not a word on its own: a single letter
 *    ("e-mail", "t-shirt", "x-ray"), a prefix ("co-founder", "re-enter",
 *    "non-stop") or a fused name ("Wi-Fi", "sci-fi").
 *  - Web addresses and e-mail addresses are one item each, never broken
 *    into "www", "com" and so on.
 *  - Dotted abbreviations stay whole: "U.S.", "e.g.", "a.m.", "Ph.D.".
 *  - Decimal and grouped numbers stay whole: "129.99", "1.5", "2,000".
 *  - Matching is case-insensitive: "Tracker" and "tracker" share one key.
 *    The exceptions are US, IT and WHO in capitals, which are different words
 *    from "us", "it" and "who".
 */

export interface Token {
  /** Character offset of the first character in the source text. */
  start: number;
  /** Character offset just past the last character. */
  end: number;
  /** Exact text as written. */
  text: string;
  /** Normalised form used for counting (lower case, except US / IT / WHO). */
  key: string;
  /** False for pure numbers like "2024" or "3.5". */
  hasLetter: boolean;
  /** A web or e-mail address. */
  link: boolean;
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

const LINK_END = `[^\\s<>".,;:!?)\\]'\\u2019]`;
const EMAIL = `[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)+`;
const URL = `(?:https?:\\/\\/|www\\.)[^\\s<>"]*${LINK_END}`;
// Bare domains are recognised only for well-known endings, in lower case, so a
// missing space after a full stop ("...the end.In fact") is not read as a link.
const DOMAIN =
  `${WORD_START}[\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:com|org|net|edu|gov|io|co\\.uk)(?![\\p{L}\\p{N}])` +
  `(?:\\/[^\\s<>"]*${LINK_END})?(?:[${APOSTROPHE}]s)?`;
const ABBREVIATION = '(?:\\p{L}{1,2}\\.){2,}';
const DECIMAL = '\\p{N}+(?:[.,]\\p{N}+)+(?![\\p{L}\\p{M}])';
const WORD = `${WORD_START}${WORD_CHAR}*(?:[${APOSTROPHE}${HYPHEN}]${WORD_START}${WORD_CHAR}*)*`;

const TOKEN_RE = new RegExp(`(${EMAIL}|${URL}|${DOMAIN})|${ABBREVIATION}|${DECIMAL}|${WORD}`, 'gu');

const LETTER_RE = /\p{L}/u;
const SINGLE_LETTER_RE = /^\p{L}$/u;
const HYPHEN_RE = /[-\u2010\u2011]/;
const HYPHEN_SPLIT_RE = /[-\u2010\u2011]/g;
const SOFT_GAP_RE = /^[ \t\u00A0\u2000-\u200B\u202F\u205F\u3000]*$/;

// First parts that are prefixes, not words: the compound stays whole.
const PREFIXES = new Set([
  'co', 're', 'pre', 'non', 'anti', 'semi', 'multi', 'sub', 'mid', 'ex', 'de', 'un', 'bi', 'tri', 'inter', 'ultra',
]);
// Names written with a hyphen whose parts mean nothing alone.
const FUSED = new Set(['wi-fi', 'hi-fi', 'sci-fi', 'lo-fi']);
// Capitalised abbreviations that are different words from their lower-case twins.
const ACRONYMS = new Set(['US', 'IT', 'WHO']);

export function normalizeKey(word: string): string {
  return word
    .normalize('NFKC')
    .replace(/[\u00AD\u200C\u200D\u2060]/g, '')
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/[\u2010\u2011]/g, '-')
    .toLowerCase();
}

/** Should "GPS-enabled" be counted as its parts? */
function splitsIntoWords(compound: string, parts: string[]): boolean {
  if (parts.some((p) => p === '' || SINGLE_LETTER_RE.test(p))) return false;
  if (PREFIXES.has(normalizeKey(parts[0])) || FUSED.has(normalizeKey(compound))) return false;
  return true;
}

export interface TokenizeOptions {
  /** Count "GPS-enabled" as "GPS" + "enabled" (default) instead of one word. */
  splitHyphens?: boolean;
}

export function tokenize(text: string, { splitHyphens = true }: TokenizeOptions = {}): Token[] {
  const tokens: Token[] = [];
  let prevEnd = 0;

  // A line written entirely in capitals has no acronyms: "WHO IS IT FOR" is just loud.
  const lineHasLowerCase = new Map<number, boolean>();
  const inMixedCaseLine = (at: number) => {
    const lineStart = text.lastIndexOf('\n', at - 1) + 1;
    let known = lineHasLowerCase.get(lineStart);
    if (known === undefined) {
      const lineEnd = text.indexOf('\n', at);
      known = /\p{Ll}/u.test(text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd));
      lineHasLowerCase.set(lineStart, known);
    }
    return known;
  };

  const push = (start: number, raw: string, link: boolean, joined: boolean) => {
    const gap = text.slice(prevEnd, start);
    tokens.push({
      start,
      end: start + raw.length,
      text: raw,
      key: ACRONYMS.has(raw) && inMixedCaseLine(start) ? raw : normalizeKey(raw),
      hasLetter: LETTER_RE.test(raw),
      link,
      breakBefore: tokens.length === 0 || !(joined || SOFT_GAP_RE.test(gap)),
    });
    prevEnd = start + raw.length;
  };

  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index!;
    const raw = m[0];
    const link = m[1] !== undefined;
    if (!link && splitHyphens && HYPHEN_RE.test(raw)) {
      const parts = raw.split(HYPHEN_SPLIT_RE);
      if (splitsIntoWords(raw, parts)) {
        let at = start;
        parts.forEach((part, i) => {
          // The parts of one compound belong to the same phrase.
          push(at, part, false, i > 0);
          at += part.length + 1;
        });
        continue;
      }
    }
    push(start, raw, link, false);
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
