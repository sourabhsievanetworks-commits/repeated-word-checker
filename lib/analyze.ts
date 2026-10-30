import { tokenize, normalizeKey, type Token } from './tokenize';
import { isStopword } from './stopwords';
import { splitSections, type HeadingMode } from './sections';
import { lemmaKeys, mergeIngForms, type LemmaSpan } from './lemmatizer';

export type CountMode = 'exact' | 'forms';

export interface AnalyzeOptions {
  /** "exact": every spelling counted separately. "forms": tracker/trackers grouped. */
  mode: CountMode;
  ignoreStopwords: boolean;
  includeHeadings: boolean;
  headingMode: HeadingMode;
  /** Extra words to leave out, e.g. brand names. */
  ignoreWords: string[];
}

export const DEFAULT_OPTIONS: AnalyzeOptions = {
  mode: 'exact',
  ignoreStopwords: true,
  includeHeadings: false,
  headingMode: 'auto',
  ignoreWords: [],
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
}

export interface ScopeResult {
  id: string;
  title: string;
  level: number;
  /** Character range of this scope in the text (heading included). */
  start: number;
  end: number;
  /** All words in this scope, common words and numbers included. */
  wordCount: number;
  words: Group[];
  phrases: Group[];
}

export interface Analysis {
  sections: ScopeResult[];
  whole: ScopeResult;
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
}

function addTo(map: Map<string, GroupBuilder>, key: string, form: string, spelling: string, occ: Occurrence) {
  let g = map.get(key);
  if (!g) {
    g = { key, count: 0, forms: new Map(), spellings: new Map(), occurrences: [] };
    map.set(key, g);
  }
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
 * Label for a group: its base word when that word is in the text ("battery"
 * for battery/batteries), otherwise its most used spelling.
 */
function label(g: GroupBuilder): string {
  const spellings = g.key.includes(' ') ? null : mostUsed(g.spellings, (s) => normalizeKey(s) === g.key);
  return spellings ?? mostUsed(g.spellings)!;
}

function finish(map: Map<string, GroupBuilder>, minCount: number): Group[] {
  const groups: Group[] = [];
  for (const g of map.values()) {
    if (g.count < minCount) continue;
    groups.push({
      key: g.key,
      display: label(g),
      count: g.count,
      forms: [...g.forms].map(([form, count]) => ({ form, count })).sort((a, b) => b.count - a.count || a.form.localeCompare(b.form)),
      occurrences: g.occurrences,
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

export function analyze(text: string, options: AnalyzeOptions, lemmaSpans?: LemmaSpan[] | null): Analysis {
  const tokens = tokenize(text);
  const sections = splitSections(text, options.headingMode);
  const ignore = new Set(options.ignoreWords.map(normalizeKey));

  // Group key for every token.
  const keyOf = new Map<Token, string>();
  if (options.mode === 'forms' && lemmaSpans) {
    const lemmas = lemmaKeys(tokens, lemmaSpans);
    for (const t of tokens) keyOf.set(t, lemmas.get(t.start) ?? t.key);
    const ing = mergeIngForms(keyOf.values());
    for (const [t, k] of keyOf) keyOf.set(t, ing.get(k) ?? k);
  } else {
    for (const t of tokens) keyOf.set(t, t.key);
  }

  const isContent = (t: Token) => {
    if (!t.hasLetter) return false;
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
    for (const t of scopeTokens) {
      if (isContent(t)) addTo(words, keyOf.get(t)!, t.key, t.text, { start: t.start, end: t.end });
    }

    const phrases = new Map<string, GroupBuilder>();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= scopeTokens.length; i++) {
        const win = scopeTokens.slice(i, i + n);
        if (win.slice(1).some((t) => t.breakBefore)) continue;
        if (!isContent(win[0]) || !isContent(win[n - 1])) continue;
        addTo(
          phrases,
          win.map((t) => keyOf.get(t)).join(' '),
          win.map((t) => t.key).join(' '),
          text.slice(win[0].start, win[n - 1].end),
          { start: win[0].start, end: win[n - 1].end },
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
      words: finish(words, 1),
      phrases: dropContainedPhrases(finish(phrases, 2)),
    };
  };

  const inSection = (t: Token, s: (typeof sections)[number]) =>
    (t.start >= s.bodyStart && t.start < s.bodyEnd) ||
    (options.includeHeadings && t.start >= s.headingStart && t.start < s.headingEnd);

  const sectionResults = sections.map((s) =>
    scope(s.id, s.title, s.level, [s.headingStart, s.bodyEnd], tokens.filter((t) => inSection(t, s))),
  );
  const wholeTokens = tokens.filter((t) => sections.some((s) => inSection(t, s)));

  return {
    sections: sectionResults,
    whole: scope('all', 'Whole blog', 0, [0, text.length], wholeTokens),
  };
}
