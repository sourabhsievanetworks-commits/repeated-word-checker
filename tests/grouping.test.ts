import { beforeAll, describe, expect, it } from 'vitest';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { analyze, DEFAULT_OPTIONS, type Group } from '@/lib/analyze';
import { createLemmatizer, type Lemmatizer } from '@/lib/lemmatizer';
import { BENCHMARK, HELD_OUT } from './grouping-benchmark';
import { scoreGrouping } from './grouping-score';
import { SYSTEMATIC } from './grouping-systematic';

let lemmatize: Lemmatizer;
beforeAll(() => {
  lemmatize = createLemmatizer(winkNLP(model) as never);
});

const forms = (text: string) => analyze(text, { ...DEFAULT_OPTIONS, mode: 'forms', headingMode: 'off' }, lemmatize(text)).whole;
const group = (gs: Group[], key: string) => gs.find((g) => g.key === key);

// Accuracy of word-form grouping. The first version of the grouping scored
// 90.1% / 83.0% / 96.7% on these three sets.
describe('word-form grouping accuracy', () => {
  it('meets every expectation in the main benchmark', () => {
    const r = scoreGrouping(lemmatize, BENCHMARK);
    expect(r.failures).toEqual([]);
  });

  it('groups every form of 120 common verbs, nouns and adjectives', () => {
    const r = scoreGrouping(lemmatize, SYSTEMATIC);
    expect(r.failures).toEqual([]);
    expect(r.total).toBeGreaterThanOrEqual(120);
  });

  it('generalises to held-out sentences (at least 96%)', () => {
    const r = scoreGrouping(lemmatize, HELD_OUT);
    expect(r.passed / r.total).toBeGreaterThanOrEqual(0.96);
  });
});

describe('word-form grouping rules', () => {
  it('puts one spelling in one group, however the model reads each use', () => {
    const w = forms('A trusted brand. Parents trust it. Trusted by millions. We trusted them.');
    expect(w.words.filter((g) => g.forms.some((f) => f.form === 'trusted'))).toHaveLength(1);
    expect(group(w.words, 'trust')!.count).toBe(4);
  });

  it('does not expand abbreviations into words that are not in the text', () => {
    const w = forms('The app is fast. Apps crash. This app works. Two apps.');
    expect(group(w.words, 'app')).toMatchObject({ count: 4, display: 'app' });
    expect(group(w.words, 'application')).toBeUndefined();
  });

  it('groups plurals of words the model does not know', () => {
    const w = forms('Jiobits are small. A Jiobit lasts a week. The Jiobit clips on. Two Jiobits.');
    expect(group(w.words, 'jiobit')!.count).toBe(4);
  });

  it('follows dictionary forms to their base word', () => {
    const w = forms('It records video. A record is kept. The recordings are saved.');
    expect(group(w.words, 'record')!.forms.map((f) => f.form).sort()).toEqual(['record', 'recordings', 'records']);
  });

  it('labels a group with its base word, in lower case unless always capitalised', () => {
    const w = forms('Battery life matters. The battery died. Battery tests helped. It helps. GPS works. The GPS failed. More data came. Data helps.');
    expect(group(w.words, 'battery')!.display).toBe('battery');
    expect(group(w.words, 'help')!.display).toBe('help');
    expect(group(w.words, 'gps')!.display).toBe('GPS');
    expect(w.words.find((g) => g.forms.some((f) => f.form === 'data'))!.display).toBe('data');
  });

  it('reports the part of speech the model saw', () => {
    const w = forms('A big screen. The big model. Big buttons help.');
    expect(group(w.words, 'big')!.pos).toBe('ADJ');
  });

  it('never changes the number of words counted', () => {
    for (const c of [...BENCHMARK, ...HELD_OUT, ...SYSTEMATIC]) {
      const exact = analyze(c.text, { ...DEFAULT_OPTIONS, headingMode: 'off' });
      const grouped = forms(c.text);
      expect(grouped.words.reduce((n, g) => n + g.count, 0)).toBe(exact.whole.wordCount);
      expect(grouped.wordCount).toBe(exact.whole.wordCount);
    }
  });
});
