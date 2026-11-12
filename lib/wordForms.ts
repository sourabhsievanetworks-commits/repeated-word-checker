/**
 * Groups the forms of a word ("track, tracks, tracked, tracking") using the
 * NLP model's reading of every word in context, plus two checks that make the
 * result consistent and catch what the model misses.
 *
 * 1. Model vote. The model tags each occurrence with a part of speech and a
 *    dictionary form. All occurrences of one spelling vote, and the spelling
 *    takes the majority answer, so one spelling never lands in two groups.
 * 2. Evidence rules. The model leaves some forms untouched: "-ing" nouns
 *    ("tracking"), "-ed"/"-en" adjectives ("trusted", "written"), some
 *    comparatives ("longer") and plurals of words it does not know ("apps").
 *    These join a base word only when that base word is itself in the text and
 *    the model saw it as a matching kind of word.
 *
 * Grouping never changes how many words are counted; it only decides which
 * rows are shown together, and every grouped spelling is listed in the row.
 */

import type { LemmaSpan } from './lemmatizer';
import { isStopword } from './stopwords';
import { stripPossessive, type Token } from './tokenize';

const POSSESSIVE = new Set(["'s", "'"]);

// Words ending in -ing / -ed that are not forms of a shorter word.
const NOT_A_FORM = new Set([
  'evening', 'morning', 'during', 'nothing', 'something', 'anything', 'everything', 'ceiling', 'sibling',
  'darling', 'sterling', 'inning', 'pudding', 'herring', 'shilling', 'string', 'spring', 'bring', 'thing',
  'king', 'ring', 'sing', 'wing', 'sting', 'swing', 'cling', 'fling', 'sling', 'being', 'wicked', 'naked',
  'sacred', 'hundred', 'beloved', 'kindred', 'rugged', 'ragged', 'crooked', 'wretched',
]);

// Irregular participles the model leaves alone when they are used as adjectives.
const IRREGULAR: Record<string, string> = {
  written: 'write', chosen: 'choose', broken: 'break', spoken: 'speak', frozen: 'freeze', stolen: 'steal',
  hidden: 'hide', driven: 'drive', given: 'give', taken: 'take', known: 'know', grown: 'grow', shown: 'show',
  drawn: 'draw', worn: 'wear', torn: 'tear', sworn: 'swear', forgotten: 'forget', fallen: 'fall',
  beaten: 'beat', bitten: 'bite', risen: 'rise', woken: 'wake', proven: 'prove', woven: 'weave',
  swollen: 'swell', built: 'build', kept: 'keep', sold: 'sell', told: 'tell', paid: 'pay', made: 'make',
  sent: 'send', spent: 'spend', bought: 'buy', brought: 'bring', caught: 'catch', taught: 'teach',
  thought: 'think', held: 'hold', heard: 'hear', lost: 'lose', meant: 'mean', dealt: 'deal', slept: 'sleep',
  swept: 'sweep', understood: 'understand',
};

const VOWEL = /[aeiou]/;

/** "runn" -> "run", "stopp" -> "stop": only a doubled consonant after one vowel. */
function undouble(stem: string): string | null {
  const n = stem.length;
  if (n < 3 || stem[n - 1] !== stem[n - 2] || VOWEL.test(stem[n - 1])) return null;
  if (!VOWEL.test(stem[n - 3]) || (n >= 4 && VOWEL.test(stem[n - 4]))) return null;
  return stem.slice(0, -1);
}

interface Candidate {
  word: string;
  /** "verb": base of a participle; "adjective": base of a comparative; "noun": singular of a plural. */
  kind: 'verb' | 'adjective' | 'noun';
}

function baseCandidates(word: string, pos: string | undefined): Candidate[] {
  const out: Candidate[] = [];
  const add = (kind: Candidate['kind'], ...words: (string | null)[]) => {
    for (const w of words) if (w && w.length >= 2 && w !== word) out.push({ word: w, kind });
  };
  const yForm = (stem: string) => (stem.endsWith('i') ? stem.slice(0, -1) + 'y' : null);
  if (word in IRREGULAR) add('verb', IRREGULAR[word]);
  if (!NOT_A_FORM.has(word)) {
    if (word.endsWith('ing') && word.length >= 5) {
      const stem = word.slice(0, -3);
      // "dying" -> "die", "lying" -> "lie"
      add('verb', stem, stem + 'e', undouble(stem), stem.endsWith('y') ? stem.slice(0, -1) + 'ie' : null);
    } else if (word.endsWith('ed') && !word.endsWith('eed') && word.length >= 4) {
      const stem = word.slice(0, -2);
      add('verb', stem, stem + 'e', undouble(stem), yForm(stem));
    }
  }
  if (pos === 'ADJ' || pos === 'ADV') {
    const suffix = word.endsWith('est') ? 'est' : word.endsWith('er') ? 'er' : null;
    if (suffix && word.length >= suffix.length + 3) {
      const stem = word.slice(0, -suffix.length);
      add('adjective', stem, stem + 'e', undouble(stem), yForm(stem));
    }
  }
  // Plurals of words the model does not know ("apps", brand names).
  if ((pos === 'NOUN' || pos === 'PROPN') && /[^su]s$/.test(word) && word.length >= 4) {
    add('noun', word.slice(0, -1), word.endsWith('es') ? word.slice(0, -2) : null, word.endsWith('ies') ? word.slice(0, -3) + 'y' : null);
  }
  return out;
}

function majority(votes: Map<string, number>, prefer: string): string {
  let best = prefer;
  let bestN = votes.get(prefer) ?? 0;
  for (const [k, n] of votes) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

const vote = (m: Map<string, Map<string, number>>, word: string, choice: string) => {
  if (!m.has(word)) m.set(word, new Map());
  const v = m.get(word)!;
  v.set(choice, (v.get(choice) ?? 0) + 1);
};

export interface WordForms {
  /** Group key for every token. */
  keyOf: Map<Token, string>;
  /** Part of speech the model saw most often for each group (NOUN, VERB, ADJ, ADV…). */
  posOf: Map<string, string>;
}

export function groupWordForms(tokens: Token[], spans: LemmaSpan[]): WordForms {
  // 1. Collect the model's reading of every occurrence.
  const lemmaVotes = new Map<string, Map<string, number>>();
  const posVotes = new Map<string, Map<string, number>>();
  // Every part of speech a word was seen as, directly or as the dictionary
  // form of another spelling ("last" is a verb because of "lasted", "lasts").
  const seenAs = new Map<string, Set<string>>();
  const see = (word: string, p: string) => {
    if (!seenAs.has(word)) seenAs.set(word, new Set());
    seenAs.get(word)!.add(p);
  };
  const surfaceOf = new Map<Token, string>();
  let j = 0;
  for (const t of tokens) {
    const surface = stripPossessive(t.key);
    surfaceOf.set(t, surface);
    while (j < spans.length && spans[j].end <= t.start) j++;
    const covered: LemmaSpan[] = [];
    for (let k = j; k < spans.length && spans[k].start < t.end; k++) covered.push(spans[k]);
    const aligned = covered.length > 0 && covered[0].start === t.start && covered[covered.length - 1].end === t.end;
    // One model token, or a word plus its possessive ("tracker" + "'s").
    const read =
      aligned &&
      (covered.length === 1 ||
        (covered.length === 2 && covered[1].pos === 'PART' && POSSESSIVE.has(covered[1].value.replace(/\u2019/g, "'"))));
    let lemma = surface;
    if (read) {
      const l = covered[0].lemma.toLowerCase().replace(/\u2019/g, "'");
      // Dictionary forms that look nothing like the written word ("best" -> "good",
      // "went" -> "go") are not heard as repetition, so the word keeps its spelling.
      // The same goes for abbreviations the model expands ("app" -> "application").
      if (l && l[0] === surface[0] && l.length <= surface.length + 2) lemma = l;
      vote(posVotes, surface, covered[0].pos);
      see(surface, covered[0].pos);
      see(lemma, covered[0].pos);
    }
    vote(lemmaVotes, surface, lemma);
  }

  // 2. Each spelling takes its majority reading (ties keep the spelling as written).
  const base = new Map<string, string>();
  const pos = new Map<string, string>();
  for (const [surface, votes] of lemmaVotes) base.set(surface, majority(votes, surface));
  for (const [surface, votes] of posVotes) pos.set(surface, majority(votes, ''));

  // 3. Evidence rules for forms the model left untouched.
  const present = new Set([...base.keys(), ...base.values()]);
  const usable = (c: Candidate, from: string) => {
    if (c.word[0] !== from[0] || isStopword(c.word) || !present.has(c.word)) return false;
    const kinds = seenAs.get(c.word);
    const sawAs = (...ps: string[]) => ps.some((p) => kinds?.has(p));
    // A participle joins a word the model saw as a verb or noun, never an
    // unrelated adjective such as "even" for "evening".
    if (c.kind === 'verb') return kinds === undefined || sawAs('VERB', 'NOUN', 'AUX', 'PROPN');
    if (c.kind === 'noun') return sawAs('NOUN', 'PROPN');
    return sawAs('ADJ', 'ADV');
  };
  // Applies to spellings in the text and to dictionary forms the model produced
  // ("recordings" -> "recording" -> "record").
  for (const word of present) {
    if ((base.get(word) ?? word) !== word || isStopword(word)) continue;
    const kinds = seenAs.get(word);
    const p = pos.get(word) ?? (kinds?.has('NOUN') ? 'NOUN' : kinds?.values().next().value);
    const found = baseCandidates(word, p).find((c) => usable(c, word));
    if (found) base.set(word, found.word);
  }

  // 4. Follow chains ("tracking" -> "track") to the final group.
  const resolve = (k: string) => {
    for (let i = 0; i < 4 && base.has(k) && base.get(k) !== k; i++) k = base.get(k)!;
    return k;
  };

  const keyOf = new Map<Token, string>();
  const groupPos = new Map<string, Map<string, number>>();
  for (const t of tokens) {
    const surface = surfaceOf.get(t)!;
    const key = resolve(surface);
    keyOf.set(t, key);
    const p = pos.get(surface);
    if (p) vote(groupPos, key, p);
  }
  const posOf = new Map<string, string>();
  for (const [key, votes] of groupPos) posOf.set(key, majority(votes, ''));
  return { keyOf, posOf };
}
