/**
 * Groups the forms of a word ("track, tracks, tracked, tracking") with fixed
 * rules and a dictionary (see morphology.ts). No model is involved.
 *
 * Each spelling in the text lists the dictionary words it could be a form of.
 * A spelling joins a base word only when the text itself shows the connection:
 * at least two different spellings lead to the same base. So "tracking" joins
 * "track" when "track", "tracks" or "tracked" is also used, and a word that
 * appears in one spelling only is never relabelled.
 *
 * Grouping never changes how many words are counted; it only decides which
 * rows are shown together, and every grouped spelling is listed in the row.
 */

import { baseCandidates, type Candidate, type Morphology } from './morphology';
import { isStopword } from './stopwords';
import { stripPossessive, type Token } from './tokenize';

export interface WordForms {
  /** Group key for every token. */
  keyOf: Map<Token, string>;
}

/** Spellings unknown to the dictionary: names, brands, new words ("Jiobits"). */
const unknown = (m: Morphology, w: string) => !m.n.has(w) && !m.v.has(w) && !m.a.has(w);

/**
 * @param standalone Spellings the writer chose to count on their own: they are
 *   never grouped with another form.
 */
export function groupWordForms(tokens: Token[], m: Morphology, standalone: ReadonlySet<string> = new Set()): WordForms {
  const surfaceOf = new Map<Token, string>();
  const surfaces = new Set<string>();
  for (const t of tokens) {
    const surface = t.link || !t.hasLetter ? t.key : stripPossessive(t.key);
    surfaceOf.set(t, surface);
    if (!t.link && t.hasLetter) surfaces.add(surface);
  }

  // 1. What each spelling could be a form of.
  const candidates = new Map<string, Candidate[]>();
  for (const s of surfaces) {
    if (standalone.has(s) || isStopword(s)) continue;
    const found = baseCandidates(m, s).filter((c) => !standalone.has(c.base));
    if (found.length) candidates.set(s, found);
  }

  // 2. How many different spellings back each base word.
  const support = new Map<string, Set<string>>();
  const back = (base: string, surface: string) => {
    if (!support.has(base)) support.set(base, new Set());
    support.get(base)!.add(surface);
  };
  for (const [s, list] of candidates) for (const c of list) back(c.base, s);
  for (const base of support.keys()) if (surfaces.has(base) && !standalone.has(base)) back(base, base);

  // 3. Each spelling takes the best-supported base that has at least two spellings.
  const base = new Map<string, string>();
  for (const [s, list] of candidates) {
    let best: string | null = null;
    let bestScore: [number, number] = [1, 0];
    for (const c of list) {
      const score: [number, number] = [support.get(c.base)!.size, surfaces.has(c.base) ? 1 : 0];
      if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) [best, bestScore] = [c.base, score];
    }
    if (best) base.set(s, best);
  }

  // 4. Plurals of words the dictionary does not know ("apps", "Jiobits"): the
  // singular must be in the text too.
  for (const s of surfaces) {
    if (base.has(s) || standalone.has(s) || !unknown(m, s) || s.length < 4 || !/[^su]s$/.test(s)) continue;
    const singular = s.endsWith('ies') ? s.slice(0, -3) + 'y' : s.slice(0, -1);
    if (surfaces.has(singular) && unknown(m, singular) && !standalone.has(singular) && !isStopword(singular)) base.set(s, singular);
  }

  // 5. Follow chains ("recordings" -> "recording" -> "record") to the final group.
  const resolve = (k: string) => {
    for (let i = 0; i < 4 && base.has(k) && base.get(k) !== k; i++) k = base.get(k)!;
    return k;
  };
  const keyOf = new Map<Token, string>();
  for (const t of tokens) keyOf.set(t, resolve(surfaceOf.get(t)!));
  return { keyOf };
}
