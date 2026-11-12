/**
 * Dictionary data for grouping the forms of a word, and the fixed rules that
 * read it. There is no model here: the same text always gives the same answer.
 *
 * The data (public/morphology.json, built by scripts/build-morphology.mjs) is:
 *  - which words exist as nouns, verbs and adjectives, from Princeton WordNet
 *    cross-checked against the American English word list (SCOWL / Hunspell
 *    en_US), so British spellings and obscure words are not used as bases;
 *  - how often each word is used in each role in WordNet's tagged text;
 *  - WordNet's irregular forms (ran -> run, children -> child).
 */

import { isStopword } from './stopwords';

interface RawMorphology {
  n: string;
  v: string;
  a: string;
  nf: string;
  vf: string;
  af: string;
  en: string;
  ev: string;
  ea: string;
}

export interface Morphology {
  /** Words that exist as a noun, verb, adjective. */
  n: ReadonlySet<string>;
  v: ReadonlySet<string>;
  a: ReadonlySet<string>;
  /** How often a word is used in each role in WordNet's tagged text. */
  nf: ReadonlyMap<string, number>;
  vf: ReadonlyMap<string, number>;
  af: ReadonlyMap<string, number>;
  /** Irregular forms: surface -> base. */
  en: ReadonlyMap<string, string>;
  ev: ReadonlyMap<string, string>;
  ea: ReadonlyMap<string, string>;
}

const words = (s: string) => new Set(s ? s.split(' ') : []);
const withCounts = (s: string) => new Map((s ? s.split(' ') : []).map((p) => p.split(':') as [string, string]).map(([w, n]) => [w, Number(n)]));
const pairs = (s: string) => new Map((s ? s.split(' ') : []).map((p) => p.split('>') as [string, string]));

export function parseMorphology(raw: RawMorphology): Morphology {
  return {
    n: words(raw.n),
    v: words(raw.v),
    a: words(raw.a),
    nf: withCounts(raw.nf),
    vf: withCounts(raw.vf),
    af: withCounts(raw.af),
    en: pairs(raw.en),
    ev: pairs(raw.ev),
    ea: pairs(raw.ea),
  };
}

let loading: Promise<Morphology> | null = null;

/** Loads the dictionary data on first use (about 220 KB compressed), once per page. */
export function loadMorphology(): Promise<Morphology> {
  loading ??= fetch('/morphology.json').then((r) => {
    if (!r.ok) throw new Error(`morphology: ${r.status}`);
    return r.json().then(parseMorphology);
  });
  loading.catch(() => (loading = null));
  return loading;
}

export type Kind = 'noun' | 'verb' | 'adjective';

export interface Candidate {
  base: string;
  kind: Kind;
}

const CONSONANT_PAIR = /([bcdfghjklmnpqrstvwxz])\1$/;
/** "runn" -> "run", "bigg" -> "big". */
const undouble = (stem: string) => (CONSONANT_PAIR.test(stem) ? stem.slice(0, -1) : null);
const yForm = (stem: string) => (stem.endsWith('i') ? stem.slice(0, -1) + 'y' : null);

/** Plural / third-person endings: "boxes" -> "box", "cities" -> "city", "knives" -> "knife". */
function sEndings(word: string): string[] {
  const out: string[] = [];
  if (word.endsWith('ies')) out.push(word.slice(0, -3) + 'y');
  if (word.endsWith('ves')) out.push(word.slice(0, -3) + 'f', word.slice(0, -3) + 'fe');
  if (word.endsWith('men')) out.push(word.slice(0, -3) + 'man');
  if (word.endsWith('es')) out.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) out.push(word.slice(0, -1));
  return out;
}

function suffixStems(word: string, suffix: 'ed' | 'ing' | 'er' | 'est'): string[] {
  if (!word.endsWith(suffix)) return [];
  const stem = word.slice(0, -suffix.length);
  const out = [stem, stem + 'e'];
  const doubled = undouble(stem);
  if (doubled) out.push(doubled);
  if (suffix === 'ing' && stem.endsWith('y')) out.push(stem.slice(0, -1) + 'ie'); // dying -> die
  if (suffix !== 'ing') {
    const y = yForm(stem);
    if (y) out.push(y);
  }
  return out;
}

/**
 * Every dictionary base this spelling can be an inflected form of: plural,
 * third person, past tense, -ing form, comparative and superlative, plus
 * WordNet's irregular forms. Derived words ("tracker", "parenting") are not
 * forms of another word, so they are never returned.
 */
export function baseCandidates(m: Morphology, word: string): Candidate[] {
  if (word.length < 3 || isStopword(word) || word !== word.toLowerCase()) return [];
  const found = new Map<string, Candidate>();
  const add = (base: string | undefined, kind: Kind, set: ReadonlySet<string>) => {
    if (!base || base === word || base.length < 2 || base[0] !== word[0] || isStopword(base) || !set.has(base)) return;
    if (!found.has(`${kind}:${base}`)) found.set(`${kind}:${base}`, { base, kind });
  };

  // Nouns: plurals.
  add(m.en.get(word), 'noun', m.n);
  for (const b of sEndings(word)) add(b, 'noun', m.n);

  // Verbs: third person, past tense, -ing form. A word that is already a verb
  // in its own right ("feed", "seed", "need") is not the past tense of another.
  add(m.ev.get(word), 'verb', m.v);
  const ownVerb = m.v.has(word);
  for (const b of [...sEndings(word), ...(ownVerb ? [] : [...suffixStems(word, 'ed'), ...suffixStems(word, 'ing')])]) add(b, 'verb', m.v);

  // Adjectives: comparative and superlative.
  add(m.ea.get(word), 'adjective', m.a);
  for (const b of [...suffixStems(word, 'er'), ...suffixStems(word, 'est')]) add(b, 'adjective', m.a);

  return [...found.values()].filter((c) => keepCandidate(m, word, c));
}

/**
 * Looks at how WordNet's tagged text uses the words involved, so look-alikes
 * are not mistaken for forms of each other.
 *
 *  - A verb base that is also a noun ("parent", "gift") counts only if the verb
 *    use is attested ("track" is, "parent" is not). So "parenting" is not a
 *    form of "parent".
 *  - A verb form that is also a noun or adjective in its own right ("evening",
 *    "tired", "limited") joins the verb only when the verb is nearly as common
 *    as that other use: "limited" joins "limit", but "tired" does not join
 *    "tire" and "evening" does not join "even".
 *  - A comparative that is also a noun ("number", "corner") is a comparative
 *    only if the adjective is common: "longer" is, "number" is not.
 */
function keepCandidate(m: Morphology, word: string, c: Candidate): boolean {
  if (c.kind === 'noun') return true;
  if (c.kind === 'adjective') {
    if (!m.n.has(word) || m.a.has(word)) return true;
    const adjectiveFreq = m.af.get(c.base) ?? 0;
    return adjectiveFreq > 0 && adjectiveFreq >= (m.nf.get(word) ?? 0) * 0.5;
  }
  const verbFreq = m.vf.get(c.base) ?? 0;
  if ((m.n.has(c.base) || m.a.has(c.base)) && verbFreq === 0) return false;
  const ownAdjective = m.a.has(word) && !m.v.has(word);
  const own = (m.n.has(word) || ownAdjective) && !m.v.has(word);
  if (!own) return true;
  const ownFreq = (m.nf.get(word) ?? 0) + (m.af.get(word) ?? 0);
  // An adjective in "-ed" ("gifted") needs clear evidence of the verb.
  return verbFreq >= (ownAdjective && word.endsWith('ed') ? 2 : 1) && verbFreq >= ownFreq * 0.75;
}
