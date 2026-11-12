// Builds public/thesaurus.json: a compact thesaurus of common English words
// from Princeton WordNet (via the wordnet-db package).
//
//   npm run build:thesaurus
//
// WordNet lists every meaning of a word, and synonyms of a rare meaning make bad
// suggestions ("buy -> bribe", "device -> twist"). So for each word and part
// of speech this keeps only:
//  - its dominant meanings: the most frequent one, plus any other used at
//    least half as often in WordNet's sense-tagged corpus;
//  - synonyms that are single words and are themselves attested in that same
//    meaning, most frequent first.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dict = require('wordnet-db').path;
const read = (f) => readFileSync(path.join(dict, f), 'utf8').split('\n').filter((l) => l && !l.startsWith('  '));

const POS = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const TYPE_NUM = { 1: 'n', 2: 'v', 3: 'a', 4: 'r', 5: 'a' };
const WORD_RE = /^[a-z]{2,20}$/;
const MAX_SYNONYMS = 6;
const STOP = new Set(['be', 'have', 'do', 'get', 'go', 'take', 'make', 'ask', 'see', 'let', 'put', 'set', 'give', 'well', 'much', 'real', 'right', 'just']);

// How often each word is used in each meaning in the tagged corpus.
const senseCount = new Map(); // `${pos}:${lemma}:${offset}` -> count
for (const line of read('index.sense')) {
  const [key, offset, , tag] = line.split(' ');
  const [lemma, rest] = key.split('%');
  const pos = TYPE_NUM[rest.split(':')[0]];
  const n = Number(tag);
  senseCount.set(`${pos}:${lemma}:${offset}`, n);
}

const out = {};
let entries = 0;
for (const [p, name] of Object.entries(POS)) {
  const synsets = new Map(); // offset -> words
  for (const line of read(`data.${name}`)) {
    const f = line.split(' ');
    const count = parseInt(f[3], 16);
    const words = [];
    for (let i = 0; i < count; i++) words.push(f[4 + i * 2].replace(/\(.*\)$/, ''));
    synsets.set(f[0], words);
  }
  out[p] = {};
  for (const line of read(`index.${name}`)) {
    const f = line.trim().split(' ');
    const lemma = f[0];
    if (!WORD_RE.test(lemma)) continue;
    const pointerCount = Number(f[3]);
    const offsets = f.slice(6 + pointerCount);
    const count = (w, o) => senseCount.get(`${p}:${w}:${o}`) ?? 0;
    const top = count(lemma, offsets[0]);
    const senses = offsets.filter((o, i) => i === 0 || (top > 0 && count(lemma, o) >= top / 2));
    const scored = new Map();
    for (const o of senses) {
      for (const w of synsets.get(o) ?? []) {
        const n = count(w, o);
        if (w === lemma || !WORD_RE.test(w) || STOP.has(w) || n < 1) continue;
        scored.set(w, Math.max(scored.get(w) ?? 0, n));
      }
    }
    const synonyms = [...scored].sort((a, b) => b[1] - a[1]).map(([w]) => w);
    if (synonyms.length) {
      out[p][lemma] = synonyms.slice(0, MAX_SYNONYMS).join(',');
      entries++;
    }
  }
}

const file = path.resolve('public/thesaurus.json');
writeFileSync(file, JSON.stringify(out));
console.log(`${entries} entries, ${(readFileSync(file).length / 1024).toFixed(0)} KB -> ${file}`);
