import { tokenize, normalizeKey, stripPossessive, uncountedCharacters, type Token } from './tokenize';
import { isStopword } from './stopwords';
import { sectionsFromHeadings, splitSections, type HeadingLine, type HeadingMode } from './sections';
import type { Morphology } from './morphology';
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
  /** Spellings that are never grouped with other forms (word-forms mode). */
  separateWords: string[];
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
  separateWords: [],
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
  /** A web or e-mail address: listed, but not flagged as repetition. */
  link: boolean;
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
  link: boolean;
  /** Times the word is capitalised in the middle of a sentence: a sign of a name. */
  properUses: number;
}

function addTo(
  map: Map<string, GroupBuilder>,
  key: string,
  form: string,
  spelling: string,
  occ: Occurrence,
  position: number,
  link = false,
  proper = false,
) {
  let g = map.get(key);
  if (!g) {
    g = { key, count: 0, forms: new Map(), spellings: new Map(), occurrences: [], positions: [], link, properUses: 0 };
    map.set(key, g);
  }
  g.positions.push(position);
  if (proper) g.properUses++;
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
 *  - Its base word when the spellings plainly come from it ("help" for
 *    helped/helps, "take" for takes/took), but never a dictionary form that
 *    looks different from everything that was written ("datum" for "data").
 *  - Otherwise its most used spelling.
 * A word that is capitalised only because it starts a sentence or sits in a
 * heading is shown in lower case; names ("Jiobit") and acronyms ("GPS") keep
 * their capitals.
 */
function label(g: GroupBuilder): string {
  const phrase = g.key.includes(' ');
  const written = phrase ? null : mostUsed(g.spellings, (s) => normalizeKey(s) === g.key);
  const stem = g.key.slice(0, -1);
  const derived = !phrase && g.key.length >= 3 && g.forms.size > 1 && [...g.forms.keys()].some((f) => f.startsWith(stem));
  const chosen = written ?? (derived ? g.key : mostUsed(g.spellings)!);
  const lower = chosen.toLowerCase();
  const titleCase = chosen !== lower && chosen.slice(1) === lower.slice(1);
  const pronounI = /^I(['\u2019]|$)/.test(chosen);
  return titleCase && !pronounI && g.properUses === 0 ? lower : chosen;
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
      link: g.link,
      close,
      closeAt,
    });
  }
  return groups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

const CAPITAL_RE = /^\p{Lu}/u;

/** Is the word at this position the first word of a sentence, line, list item or cell? */
function startsSentence(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && /[ \t"'\u201C\u2018(\[]/.test(text[i])) i--;
  return i < 0 || /[\n.!?:\u2026]/.test(text[i]);
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
  morphology?: Morphology | null,
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
  if (options.mode === 'forms' && morphology) {
    ({ keyOf } = groupWordForms(tokens, morphology, new Set(options.separateWords.map(normalizeKey))));
  } else {
    for (const t of tokens) keyOf.set(t, stripPossessive(t.key));
  }

  // Links are never a form of another word.
  for (const t of tokens) if (t.link) keyOf.set(t, stripPossessive(t.key));

  const isContent = (t: Token) => {
    if (!t.hasLetter && !options.includeNumbers) return false;
    const k = keyOf.get(t)!;
    if (ignore.has(t.key.toLowerCase()) || ignore.has(k.toLowerCase())) return false;
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
      if (isContent(t)) {
        const proper = !heading && CAPITAL_RE.test(t.text) && !startsSentence(text, t.start);
        addTo(words, keyOf.get(t)!, t.key, t.text, { start: t.start, end: t.end }, position, t.link, proper);
      }
    });

    const phrases = new Map<string, GroupBuilder>();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= scopeTokens.length; i++) {
        const win = scopeTokens.slice(i, i + n);
        if (win.slice(1).some((t) => t.breakBefore)) continue;
        // Phrases that start or end with "the", "and"… are noise, not repetition.
        const edge = (t: Token) => t.hasLetter && !t.link && isContent(t) && !isStopword(t.key) && !isStopword(keyOf.get(t)!);
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
      words: finish(words, 1, options.closeWindow),
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
