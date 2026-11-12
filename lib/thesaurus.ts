/**
 * Suggested alternatives for an overused word, from a compact thesaurus built
 * out of Princeton WordNet (see scripts/build-thesaurus.mjs). The NLP model's
 * part-of-speech reading picks the right list: "track" as a verb suggests
 * "trail", as a noun "course".
 */

type PosKey = 'n' | 'v' | 'a' | 'r';
export type Thesaurus = Record<PosKey, Record<string, string>>;

const POS_KEY: Record<string, PosKey> = { NOUN: 'n', PROPN: 'n', VERB: 'v', AUX: 'v', ADJ: 'a', ADV: 'r' };
const POS_LABEL: Record<PosKey, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

let loading: Promise<Thesaurus> | null = null;

/** Loads the thesaurus on first use (about 10 KB compressed). */
export function loadThesaurus(): Promise<Thesaurus> {
  loading ??= fetch('/thesaurus.json').then((r) => {
    if (!r.ok) throw new Error(`thesaurus: ${r.status}`);
    return r.json() as Promise<Thesaurus>;
  });
  loading.catch(() => (loading = null));
  return loading;
}

export interface Alternatives {
  /** "noun", "verb"… */
  as: string;
  words: string[];
}

/**
 * @param words The group's base word first, then its other spellings.
 * @param pos The model's part of speech for the group, when known.
 */
export function alternatives(t: Thesaurus, words: string[], pos?: string): Alternatives[] {
  const lookup = (p: PosKey): Alternatives | null => {
    for (const w of words) {
      const entry = t[p]?.[w];
      if (entry) return { as: POS_LABEL[p], words: entry.split(',').filter((s) => !words.includes(s)) };
    }
    return null;
  };
  // With the model's reading, suggest only for that kind of word: synonyms of
  // "common" the noun (a park) are wrong for "common" the adjective.
  const known = pos ? POS_KEY[pos] : undefined;
  if (pos) {
    const match = known ? lookup(known) : null;
    return match?.words.length ? [match] : [];
  }
  // Without a part of speech (exact mode), offer each kind the word can be.
  return (['n', 'v', 'a', 'r'] as PosKey[]).map(lookup).filter((a): a is Alternatives => a !== null && a.words.length > 0);
}
