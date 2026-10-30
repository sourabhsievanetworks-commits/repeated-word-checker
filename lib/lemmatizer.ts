/**
 * "Word forms" grouping using a machine-learning NLP model (wink-nlp with the
 * wink-eng-lite-web-model English model). The model reads each word in its
 * sentence, tags its part of speech and returns its dictionary form (lemma):
 * "trackers" -> "tracker", "ran" -> "run", "studies" -> "study".
 *
 * The model never changes how many words are counted. It only decides which
 * of our own tokens share a group. Whenever it is unsure or disagrees with our
 * tokenizer, the word falls back to its exact form, so a model mistake can only
 * leave two forms ungrouped, never miscount them.
 */

import type { Token } from './tokenize';

export interface LemmaSpan {
  start: number;
  end: number;
  value: string;
  lemma: string;
  pos: string;
}

export type Lemmatizer = (text: string) => LemmaSpan[];

/**
 * Lower-cases character by character so offsets stay identical. The model
 * lemmatises far better on lower-case text: capitalised words at the start of
 * a sentence or in a heading are otherwise tagged as proper nouns and skipped.
 */
function lowerSameLength(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

// Minimal shape of the parts of wink-nlp we use.
interface WinkLike {
  readDoc(text: string): {
    tokens(): {
      out(f: unknown): string[];
    };
  };
  its: Record<string, unknown>;
}

export function createLemmatizer(nlp: WinkLike): Lemmatizer {
  const its = nlp.its;
  return (text: string) => {
    const lower = lowerSameLength(text);
    const doc = nlp.readDoc(lower);
    const values = doc.tokens().out(its.value);
    const lemmas = doc.tokens().out(its.lemma);
    const pos = doc.tokens().out(its.pos);
    const spans: LemmaSpan[] = [];
    let cursor = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!v || /^\s+$/.test(v)) continue;
      const at = lower.indexOf(v, cursor);
      // Only accept positions right after whitespace we skipped; otherwise the
      // model and the text disagree and we leave this token unmapped.
      if (at < 0 || !/^\s*$/.test(lower.slice(cursor, at))) continue;
      spans.push({ start: at, end: at + v.length, value: v, lemma: lemmas[i], pos: pos[i] });
      cursor = at + v.length;
    }
    return spans;
  };
}

let loading: Promise<Lemmatizer> | null = null;

/** Loads the model on demand (about 1 MB gzipped), once per page. */
export function loadLemmatizer(): Promise<Lemmatizer> {
  loading ??= Promise.all([import('wink-nlp'), import('wink-eng-lite-web-model')]).then(
    ([wink, model]) => createLemmatizer(wink.default(model.default) as unknown as WinkLike),
  );
  return loading;
}

const POSSESSIVE = new Set(["'s", "'", '\u2019s', '\u2019']);

/**
 * Maps each content token (by start offset) to its word-form key.
 * Tokens without a confident lemma are left out and keep their exact key.
 */
export function lemmaKeys(tokens: Token[], spans: LemmaSpan[]): Map<number, string> {
  const result = new Map<number, string>();
  let j = 0;
  for (const t of tokens) {
    while (j < spans.length && spans[j].end <= t.start) j++;
    const covered: LemmaSpan[] = [];
    let k = j;
    while (k < spans.length && spans[k].start < t.end) covered.push(spans[k++]);
    if (covered.length === 0) continue;
    if (covered[0].start !== t.start || covered[covered.length - 1].end !== t.end) continue;

    let lemma: string | null = null;
    if (covered.length === 1) lemma = covered[0].lemma;
    // "tracker's" -> "tracker" + possessive "'s"
    else if (covered.length === 2 && covered[1].pos === 'PART' && POSSESSIVE.has(covered[1].value))
      lemma = covered[0].lemma;
    if (!lemma) continue;

    const key = lemma.toLowerCase().replace(/\u2019/g, "'");
    // Reject lemmas that look nothing like the written word (e.g. "best" -> "good",
    // "went" -> "go"): readers do not hear those as repetition.
    if (key[0] !== t.key[0]) continue;
    if (key !== t.key) result.set(t.start, key);
  }
  return result;
}

/**
 * The model keeps nouns ending in -ing ("tracking", "building") separate from
 * their verb ("track", "build"). When both appear in the same blog they read as
 * repetition, so the -ing form joins the base word's group.
 */
export function mergeIngForms(keys: Iterable<string>): Map<string, string> {
  const all = new Set(keys);
  const merged = new Map<string, string>();
  for (const k of all) {
    if (!k.endsWith('ing') || k.length < 6) continue;
    const stem = k.slice(0, -3);
    const candidates = [stem, stem + 'e'];
    if (stem.length >= 4 && stem[stem.length - 1] === stem[stem.length - 2]) candidates.push(stem.slice(0, -1));
    const base = candidates.find((c) => c.length >= 3 && all.has(c));
    if (base) merged.set(k, base);
  }
  return merged;
}
