/**
 * Puts a replacement word into the same form as the word it replaces, with
 * fixed spelling rules and the dictionary's irregular forms:
 *   "bought" -> replace with "purchase" -> "purchased"
 *   "trackers" -> "device" -> "devices"
 *   "Running" -> "jog" -> "Jogging"
 */

import { baseCandidates, type Morphology } from './morphology';

export type Form = 'base' | 'plural' | 'third' | 'past' | 'ing' | 'comparative' | 'superlative';

export type WordKind = 'noun' | 'verb' | 'adjective';

export interface Reading {
  kind: WordKind;
  form: Form;
}

/**
 * The ways the written word can be a form of `base`: "tracks" is a plural
 * noun or a verb, "bought" is a past tense, "battery" is the base noun.
 */
export function readingsOf(m: Morphology | null, written: string, base: string): Reading[] {
  const w = written.toLowerCase().replace(/['\u2019]s$/, '');
  if (w === base || !m) {
    if (!m) return [];
    const kinds: WordKind[] = [];
    if (m.n.has(base)) kinds.push('noun');
    if (m.v.has(base)) kinds.push('verb');
    if (m.a.has(base)) kinds.push('adjective');
    return kinds.map((kind) => ({ kind, form: 'base' }));
  }
  return baseCandidates(m, w)
    .filter((c) => c.base === base)
    .map((c): Reading => {
      if (c.kind === 'noun') return { kind: 'noun', form: 'plural' };
      if (c.kind === 'adjective') return { kind: 'adjective', form: w.endsWith('st') ? 'superlative' : 'comparative' };
      if (w.endsWith('ing')) return { kind: 'verb', form: 'ing' };
      if (w.endsWith('s') && !w.endsWith('ss')) return { kind: 'verb', form: 'third' };
      return { kind: 'verb', form: 'past' };
    });
}

const VOWEL = /[aeiou]/;
/** "stop" -> "stopp", "plan" -> "plann": one vowel then one consonant, short word. */
function doubled(w: string): string {
  return /^[^aeiou]*[aeiou][bcdfgklmnprstvz]$/.test(w) && w.length <= 4 ? w + w[w.length - 1] : w;
}

const reverse = new WeakMap<ReadonlyMap<string, string>, Map<string, string[]>>();
/** base -> irregular forms, from a form -> base table. */
function irregular(table: ReadonlyMap<string, string>, base: string): string[] {
  let r = reverse.get(table);
  if (!r) {
    r = new Map();
    for (const [form, b] of table) {
      if (!r.has(b)) r.set(b, []);
      r.get(b)!.push(form);
    }
    reverse.set(table, r);
  }
  return r.get(base) ?? [];
}

function sForm(w: string): string {
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  return w + 's';
}

/** Possible spellings of `word` in the given form (usually one). */
export function inflect(m: Morphology | null, word: string, form: Form): string[] {
  const w = word.toLowerCase();
  switch (form) {
    case 'base':
      return [w];
    case 'plural': {
      const irr = m ? irregular(m.en, w) : [];
      return irr.length ? irr : [sForm(w)];
    }
    case 'third':
      return [w === 'have' ? 'has' : sForm(w)];
    case 'past': {
      const irr = m ? irregular(m.ev, w).filter((f) => !f.endsWith('ing') && !f.endsWith('s')) : [];
      if (irr.length) return irr;
      if (w.endsWith('e')) return [w + 'd'];
      if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ied'];
      return [doubled(w) + 'ed'];
    }
    case 'ing':
      if (w.endsWith('ie')) return [w.slice(0, -2) + 'ying'];
      if (w.endsWith('e') && !/(ee|ye|oe)$/.test(w)) return [w.slice(0, -1) + 'ing'];
      return [doubled(w) + 'ing'];
    case 'comparative':
    case 'superlative': {
      const sup = form === 'superlative';
      const irr = m ? irregular(m.ea, w).filter((f) => f.endsWith('st') === sup) : [];
      if (irr.length) return irr;
      const short = w.length <= 5 || /[^aeiou]y$/.test(w);
      if (!short) return [`${sup ? 'most' : 'more'} ${w}`];
      if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + (sup ? 'iest' : 'ier')];
      if (w.endsWith('e')) return [w + (sup ? 'st' : 'r')];
      return [(VOWEL.test(w) ? doubled(w) : w) + (sup ? 'est' : 'er')];
    }
  }
}

/** Gives the replacement the capitals of the word it replaces, and keeps "'s". */
export function matchWritten(written: string, replacement: string): string {
  const possessive = /['\u2019]s$/.exec(written)?.[0] ?? '';
  const word = possessive ? written.slice(0, -possessive.length) : written;
  let out = replacement;
  if (word.length > 1 && word === word.toUpperCase() && /\p{Lu}/u.test(word)) out = out.toUpperCase();
  else if (/^\p{Lu}/u.test(word)) out = out[0].toUpperCase() + out.slice(1);
  return out + possessive;
}
