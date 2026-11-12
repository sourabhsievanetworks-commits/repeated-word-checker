// Builds public/morphology.json: the dictionary data behind "Word forms".
//
//   npm run build:morphology
//
// Everything here is open data, combined with fixed rules (no model):
//  - Princeton WordNet 3.x (wordnet-db): which words exist as nouns, verbs and
//    adjectives, and how often each is used in each role in WordNet's
//    sense-tagged text.
//  - WordNet's irregular-form lists (wink-lexicon): ran -> run, children -> child.
//  - SCOWL / Hunspell en_US (dictionary-en): the American English word list,
//    with its affix rules expanded. A word is kept only when both WordNet and
//    en_US know it.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const dict = require('wordnet-db').path;
const lines = (file) => readFileSync(file, 'utf8').split('\n');
const WORD_RE = /^[a-z]{2,20}$/;

// American English word list: every word the Hunspell en_US dictionary can
// produce. Its entries are stems plus affix flags ("cord/ASDG" also makes
// "record", "cords", "corded", "cording"), so the affix rules are applied.
const dicDir = path.dirname(require.resolve('dictionary-en'));
const affRules = { PFX: new Map(), SFX: new Map() };
for (const line of lines(path.join(dicDir, 'index.aff'))) {
  const f = line.trim().split(/\s+/);
  if (f[0] !== 'PFX' && f[0] !== 'SFX') continue;
  const table = affRules[f[0]];
  if (f.length === 4) table.set(f[1], { cross: f[2] === 'Y', rules: [] }); // header
  else if (f.length >= 5) {
    const [add, continuation] = f[3].split('/');
    const condition = f[4] === '.' ? null : new RegExp(f[0] === 'PFX' ? `^${f[4]}` : `${f[4]}$`);
    table.get(f[1]).rules.push({
      strip: f[2] === '0' ? '' : f[2],
      add: add === '0' ? '' : add,
      condition,
    });
  }
}
const apply = (word, flag, kind) => {
  const out = [];
  for (const { strip, add, condition } of affRules[kind].get(flag)?.rules ?? []) {
    if (condition && !condition.test(word)) continue;
    if (kind === 'SFX') {
      if (strip && !word.endsWith(strip)) continue;
      out.push(word.slice(0, word.length - strip.length) + add);
    } else {
      if (strip && !word.startsWith(strip)) continue;
      out.push(add + word.slice(strip.length));
    }
  }
  return out;
};
const american = new Set();
for (const line of lines(path.join(dicDir, 'index.dic')).slice(1)) {
  const [stem, flags = ''] = line.trim().split('/');
  if (!stem) continue;
  american.add(stem);
  const suffixed = [];
  for (const flag of flags) {
    if (affRules.SFX.has(flag)) for (const w of apply(stem, flag, 'SFX')) (american.add(w), suffixed.push([w, affRules.SFX.get(flag).cross]));
  }
  for (const flag of flags) {
    if (!affRules.PFX.has(flag)) continue;
    for (const w of apply(stem, flag, 'PFX')) american.add(w);
    if (!affRules.PFX.get(flag).cross) continue;
    for (const [w, cross] of suffixed) if (cross) for (const x of apply(w, flag, 'PFX')) american.add(x);
  }
}

// How often each word is used in each role in WordNet's tagged text.
const TYPE = { 1: 'n', 2: 'v', 3: 'a', 4: 'r', 5: 'a' };
const freq = { n: new Map(), v: new Map(), a: new Map() };
for (const line of lines(path.join(dict, 'index.sense'))) {
  if (!line) continue;
  const [key, , , tag] = line.split(' ');
  const [lemma, rest] = key.split('%');
  const pos = TYPE[rest.split(':')[0]];
  if (freq[pos]) freq[pos].set(lemma, (freq[pos].get(lemma) ?? 0) + Number(tag));
}

const FILES = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const lemmas = {};
for (const [pos, name] of Object.entries(FILES)) {
  lemmas[pos] = new Set();
  for (const line of lines(path.join(dict, `index.${name}`))) {
    if (!line || line.startsWith('  ')) continue;
    const lemma = line.split(' ')[0];
    if (WORD_RE.test(lemma) && american.has(lemma)) lemmas[pos].add(lemma);
  }
}

const counts = (pos) =>
  [...lemmas[pos]]
    .filter((w) => (freq[pos].get(w) ?? 0) > 0)
    .sort()
    .map((w) => `${w}:${freq[pos].get(w)}`)
    .join(' ');

// Irregular forms, kept when the base word is one we know.
const exceptions = (pos, file) => {
  const table = require(`wink-lexicon/src/${file}`);
  return Object.entries(table)
    .filter(([form, base]) => WORD_RE.test(form) && typeof base === 'string' && lemmas[pos].has(base))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([form, base]) => `${form}>${base}`)
    .join(' ');
};

const out = {
  n: [...lemmas.n].sort().join(' '),
  v: [...lemmas.v].sort().join(' '),
  a: [...lemmas.a].sort().join(' '),
  r: [...lemmas.r].sort().join(' '),
  nf: counts('n'),
  vf: counts('v'),
  af: counts('a'),
  en: exceptions('n', 'wn-noun-exceptions.js'),
  ev: exceptions('v', 'wn-verb-exceptions.js'),
  ea: exceptions('a', 'wn-adjective-exceptions.js'),
};
const file = path.resolve('public/morphology.json');
writeFileSync(file, JSON.stringify(out));
const sizes = Object.fromEntries(Object.entries(lemmas).map(([k, v]) => [k, v.size]));
console.log(`lemmas ${JSON.stringify(sizes)}, ${(readFileSync(file).length / 1024).toFixed(0)} KB -> ${file}`);
