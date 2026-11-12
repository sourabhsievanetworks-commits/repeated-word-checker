import { tokenize, normalizeKey, stripPossessive, uncountedCharacters, type Token } from './tokenize';
import { isStopword } from './stopwords';
import { sectionsFromHeadings, splitSections, type HeadingLine, type HeadingMode } from './sections';
import type { LemmaSpan } from './lemmatizer';
import { groupWordForms } from './wordForms';

export type CountMode = 'exact' | 'forms';

export interface AnalyzeOptions {
  /** "exact": every spelling counted separately. "forms": tracker/trackers grouped. */
  mode: CountMode;
  /** Leave common words (the, and, is…) out completely. Off by default. */
  ignoreStopwords: boolean;
  includeHeadings: boolean;
  includeNumbers: boolean;
  /** Count "GPS-enabled" as "GPS" + "enabled". */
  splitHyphens: boolean;
  headingMode: HeadingMode;
  /** Extra words to leave out, e.g. brand names. */
  ignoreWords: string[];
  /** A word used again within this many words counts as a close repeat. */
  closeWindow: number;
}

/** By default every word in the text is counted. */
export const DEFAULT_OPTIONS: AnalyzeOptions = {
  mode: 'exact',
  ignoreStopwords: false,
  includeHeadings: true,
  includeNumbers: true,
  splitHyphens: true,
  headingMode: 'auto',
  ignoreWords: [],
  closeWindow: 12,
};

export interface Occurrence {
  start: number;
  end: number;
}

export interface Group {
  key: string;
  /** How the word is shown: its most common spelling in the text. */
  display: string;
  count: number;
  /** Spellings that were grouped together, most used first. */
  forms: { form: string; count: number }[];
  occurrences: Occurrence[];
  /** A common word like "the" or "and": listed, but not flagged as repetition. */
  common: boolean;
  /** A number like "2024" or "129.99": listed, but not flagged as repetition. */
  number: boolean;
  /** Part of speech the model saw most often (word-forms mode only). */
  pos?: string;
  /** How many uses come within a few words of the previous use ("close repeats"). */
  close: number;
  /** For each occurrence: is it part of a close repeat (it or its neighbour)? */
  closeAt: boolean[];
}

export interface ScopeResult {
  id: string;
  title: string;
  level: number;
  /** Character range of this scope in the text (heading included). */
  start: number;
  end: number;
  /** For the introduction: the H1 title. */
  h1?: string;
  /** Sub-headings (H3…) counted inside this section. */
  subheadings?: string[];
  /** All words in this scope, common words and numbers included. */
  wordCount: number;
  words: Group[];
  phrases: Group[];
}

/** Self-check that every word was read and counted. */
export interface CoverageCheck {
  /** Every word in the text, headings and numbers included. */
  totalWords: number;
  /** Words that appear in the word lists (sum of every count). */
  listedWords: number;
  /** Words left out on purpose by settings (common words, numbers, skip list, headings). */
  hiddenBySettings: number;
  /** Letters or digits the tokenizer did not read. Always empty unless there is a bug. */
  unreadCharacters: string[];
}

export interface Analysis {
  sections: ScopeResult[];
  whole: ScopeResult;
  check: CoverageCheck;
}

export function parseWordList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((w) => normalizeKey(w.trim()))
    .filter(Boolean);
}

interface GroupBuilder {
  key: string;
  count: number;
  forms: Map<string, number>;
  spellings: Map<string, number>;
  occurrences: Occurrence[];
  /** Word position of each occurrence within its scope. */
  positions: number[];
}

function addTo(
  map: Map<string, GroupBuilder>,
  key: string,
  form: string,
  spelling: string,
  occ: Occurrence,
  position: number,
) {
  let g = map.get(key);
  if (!g) {
    g = { key, count: 0, forms: new Map(), spellings: new Map(), occurrences: [], positions: [] };
    map.set(key, g);
  }
  g.positions.push(position);
  g.count++;
  g.forms.set(form, (g.forms.get(form) ?? 0) + 1);
  g.spellings.set(spelling, (g.spellings.get(spelling) ?? 0) + 1);
  g.occurrences.push(occ);
}

/** Most used entry; ties go to the lower-case spelling ("tracker" over "Tracker"). */
function mostUsed(m: Map<string, number>, accept: (k: string) => boolean = () => true): string | null {
  let best: string | null = null;
  let bestN = -1;
  for (const [k, n] of m) {
    if (!accept(k)) continue;
    if (n > bestN || (n === bestN && k === k.toLowerCase() && best !== best!.toLowerCase())) [best, bestN] = [k, n];
  }
  return best;
}

/**
 * Label for a group.
 *  - Its base word when that word is in the text ("battery" for battery/batteries).
 *  - Its base word when every spelling plainly comes from it ("help" for
 *    helped/helps), but never a dictionary form that looks different from
 *    what was written ("datum" for "data").
 *  - Otherwise its most used spelling.
 * A word that is only capitalised at the start of sentences is shown in lower case.
 */
function label(g: GroupBuilder): string {
  const phrase = g.key.includes(' ');
  const written = phrase ? null : mostUsed(g.spellings, (s) => normalizeKey(s) === g.key);
  const stem = g.key.slice(0, -1);
  const derived = !phrase && g.key.length >= 3 && g.forms.size > 1 && [...g.forms.keys()].every((f) => f.startsWith(stem));
  const chosen = written ?? (derived ? g.key : mostUsed(g.spellings)!);
  const lower = chosen.toLowerCase();
  // "Battery" -> "battery" when the lower-case spelling is also in the text; "GPS" stays.
  const titleCase = chosen !== lower && chosen.slice(1) === lower.slice(1);
  return titleCase && g.spellings.has(lower) ? lower : chosen;
}

function finish(map: Map<string, GroupBuilder>, minCount: number, closeWindow: number): Group[] {
  const groups: Group[] = [];
  for (const g of map.values()) {
    if (g.count < minCount) continue;
    const closeAt = g.positions.map(() => false);
    let close = 0;
    for (let i = 1; i < g.positions.length; i++) {
      if (g.positions[i] - g.positions[i - 1] > closeWindow) continue;
      close++;
      closeAt[i] = closeAt[i - 1] = true;
    }
    groups.push({
      key: g.key,
      display: label(g),
      count: g.count,
      forms: [...g.forms].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
      occurrences: g.occurrences,
      common: isStopword(g.key) || [...g.forms.keys()].some(isStopword),
      number: !/\p{L}/u.test(g.key),
      close,
      closeAt,
    });
  }
  return groups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Drops a phrase when a longer phrase containing it occurs just as often. */
function dropContainedPhrases(phrases: Group[]): Group[] {
  return phrases.filter(
    (p) => !phrases.some((q) => q !== p && q.count === p.count && q.key.length > p.key.length && ` ${q.key} `.includes(` ${p.key} `)),
  );
}

/**
 * @param headings Headings from the editor (exact H1-H6). Without them,
 *   headings are found in the plain text ("#" lines or the plain-text rule).
 */
export function analyze(
  text: string,
  options: AnalyzeOptions,
  lemmaSpans?: LemmaSpan[] | null,
  headings?: HeadingLine[],
): Analysis {
  const tokens = tokenize(text, { splitHyphens: options.splitHyphens });
  const sections =
    headings && options.headingMode !== 'off'
      ? sectionsFromHeadings(text, headings)
      : splitSections(text, headings ? 'off' : options.headingMode);
  const ignore = new Set(options.ignoreWords.map(normalizeKey));

  // Group key for every token.
  let keyOf = new Map<Token, string>();
  let posOf = new Map<string, string>();
  if (options.mode === 'forms' && lemmaSpans) {
    ({ keyOf, posOf } = groupWordForms(tokens, lemmaSpans));
  } else {
    for (const t of tokens) keyOf.set(t, stripPossessive(t.key));
  }

  const isContent = (t: Token) => {
    if (!t.hasLetter && !options.includeNumbers) return false;
    const k = keyOf.get(t)!;
    if (ignore.has(t.key) || ignore.has(k)) return false;
    if (options.ignoreStopwords && (isStopword(t.key) || isStopword(k))) return false;
    return true;
  };

  const scope = (
    id: string,
    title: string,
    level: number,
    range: [number, number],
    scopeTokens: Token[],
  ): ScopeResult => {
    const words = new Map<string, GroupBuilder>();
    // Word positions for close-repeat detection. A heading and the text around
    // it are kept apart: a title followed by the same word is normal writing.
    let position = 0;
    let lastHeading: HeadingLine | undefined;
    scopeTokens.forEach((t, i) => {
      const heading = headingOf(t);
      if (i > 0 && heading !== lastHeading) position += options.closeWindow;
      lastHeading = heading;
      position++;
      if (isContent(t)) addTo(words, keyOf.get(t)!, t.key, t.text, { start: t.start, end: t.end }, position);
    });

    const phrases = new Map<string, GroupBuilder>();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= scopeTokens.length; i++) {
        const win = scopeTokens.slice(i, i + n);
        if (win.slice(1).some((t) => t.breakBefore)) continue;
        // Phrases that start or end with "the", "and"… are noise, not repetition.
        const edge = (t: Token) => t.hasLetter && isContent(t) && !isStopword(t.key) && !isStopword(keyOf.get(t)!);
        if (!edge(win[0]) || !edge(win[n - 1])) continue;
        addTo(
          phrases,
          win.map((t) => keyOf.get(t)).join(' '),
          win.map((t) => t.key).join(' '),
          text.slice(win[0].start, win[n - 1].end),
          { start: win[0].start, end: win[n - 1].end },
          i,
        );
      }
    }

    return {
      id,
      title,
      level,
      start: range[0],
      end: range[1],
      wordCount: scopeTokens.length,
      words: finish(words, 1, options.closeWindow).map((g) => (posOf.has(g.key) ? { ...g, pos: posOf.get(g.key) } : g)),
      phrases: dropContainedPhrases(finish(phrases, 2, options.closeWindow)),
    };
  };

  const allHeadings = sections.flatMap((s) => s.headings);
  const headingOf = (t: Token) => allHeadings.find((h) => t.start >= h.start && t.start < h.end);
  const counted = (t: Token) => options.includeHeadings || !headingOf(t);
  const inSection = (t: Token, s: (typeof sections)[number]) => t.start >= s.start && t.start < s.end && counted(t);

  const sectionResults = sections.map((s) => ({
    ...scope(s.id, s.title, s.level, [s.start, s.end], tokens.filter((t) => inSection(t, s))),
    h1: s.h1,
    subheadings: s.subheadings.map((h) => `H${h.level} ${h.title}`),
  }));
  const wholeTokens = tokens.filter(counted);
  const whole = scope('all', 'Whole blog', 0, [0, text.length], wholeTokens);
  const listedWords = whole.words.reduce((n, g) => n + g.count, 0);

  return {
    sections: sectionResults,
    whole,
    check: {
      totalWords: tokens.length,
      listedWords,
      hiddenBySettings: tokens.length - listedWords,
      unreadCharacters: uncountedCharacters(text, tokens),
    },
  };
}
