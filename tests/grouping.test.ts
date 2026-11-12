import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_OPTIONS, type Group } from '@/lib/analyze';
import { parseMorphology } from '@/lib/morphology';
import { BENCHMARK, FRESH, HELD_OUT, PRECISION } from './grouping-benchmark';
import { scoreGrouping } from './grouping-score';
import { SYSTEMATIC } from './grouping-systematic';

const morphology = parseMorphology(JSON.parse(readFileSync('public/morphology.json', 'utf8')));

const forms = (text: string) => analyze(text, { ...DEFAULT_OPTIONS, mode: 'forms', headingMode: 'off' }, morphology).whole;
const group = (gs: Group[], key: string) => gs.find((g) => g.key === key);

// Accuracy of word-form grouping. The first version of the grouping scored
// 90.1% / 83.0% / 96.7% on these three sets.
describe('word-form grouping accuracy', () => {
  it('meets every expectation in the main benchmark', () => {
    const r = scoreGrouping(morphology, BENCHMARK);
    expect(r.failures).toEqual([]);
  });

  it('groups every form of 120 common verbs, nouns and adjectives', () => {
    const r = scoreGrouping(morphology, SYSTEMATIC);
    expect(r.failures).toEqual([]);
    expect(r.total).toBeGreaterThanOrEqual(120);
  });

  it('generalises to held-out sentences', () => {
    const r = scoreGrouping(morphology, HELD_OUT);
    expect(r.failures).toEqual([]);
  });

  it('carries over to sentences it was never tuned on (fresh set)', () => {
    const r = scoreGrouping(morphology, FRESH);
    expect(r.total).toBe(62);
    // Known miss: "housing" is grouped with "house"; it is a separate noun.
    expect(r.failures.map((f) => f.words.join('/'))).toEqual(['housing/house']);
  });

  it('never groups 60 pairs of look-alike words', () => {
    const r = scoreGrouping(morphology, PRECISION);
    expect(r.failures).toEqual([]);
    expect(r.total).toBe(60);
  });
});

describe('word-form grouping rules', () => {
  it('puts one spelling in one group', () => {
    const w = forms('A trusted brand. Parents trust it. Trusted by millions. We trusted them.');
    expect(w.words.filter((g) => g.forms.some((f) => f.form === 'trusted'))).toHaveLength(1);
    expect(group(w.words, 'trust')!.count).toBe(4);
  });

  it('does not expand abbreviations into words that are not in the text', () => {
    const w = forms('The app is fast. Apps crash. This app works. Two apps.');
    expect(group(w.words, 'app')).toMatchObject({ count: 4, display: 'app' });
    expect(group(w.words, 'application')).toBeUndefined();
  });

  it('groups plurals of words the dictionary does not know', () => {
    const w = forms('Jiobits are small. A Jiobit lasts a week. The Jiobit clips on. Two Jiobits.');
    expect(group(w.words, 'jiobit')!.count).toBe(4);
  });

  it('does not treat a derived noun as a form of its verb', () => {
    const w = forms('It records video. A record is kept. The recordings are saved.');
    expect(group(w.words, 'record')!.forms.map((f) => f.form).sort()).toEqual(['record', 'records']);
    expect(group(w.words, 'recordings')!.count).toBe(1);
  });

  it('labels a group with its base word, in lower case unless always capitalised', () => {
    const w = forms('Battery life matters. The battery died. Battery tests helped. It helps. GPS works. The GPS failed. More data came. Data helps.');
    expect(group(w.words, 'battery')!.display).toBe('battery');
    expect(group(w.words, 'help')!.display).toBe('help');
    expect(group(w.words, 'gps')!.display).toBe('GPS');
    const irregular = forms('It takes time. It took a week. They chose one. We choose daily.');
    expect(group(irregular.words, 'take')!.display).toBe('take');
    expect(group(irregular.words, 'choose')!.display).toBe('choose');
    expect(w.words.find((g) => g.forms.some((f) => f.form === 'data'))!.display).toBe('data');
  });

  it('joins an -ing word only to a verb that is used as a verb', () => {
    const noun = forms('Parenting is hard. Parents know. Good parenting helps.');
    expect(group(noun.words, 'parenting')!.count).toBe(2);
    expect(group(noun.words, 'parents')!.count).toBe(1);
    const verb = forms('Tracking is easy. We track every device. GPS tracking works.');
    expect(group(verb.words, 'track')!.count).toBe(3);
  });

  it('groups a form with its base only when two spellings are in the text', () => {
    // "left" could be a form of "leave", but nothing in the text shows it.
    const w = forms('Turn left. The left side. He left early.');
    expect(group(w.words, 'left')!.count).toBe(3);
    expect(group(w.words, 'leave')).toBeUndefined();
    const both = forms('We leave now. He left early.');
    expect(group(both.words, 'leave')!.forms.map((f) => f.form).sort()).toEqual(['leave', 'left']);
  });

  it('counts a spelling on its own when the writer asks for it', () => {
    const text = 'It records video. A record is kept. The recordings are saved. Recordings help.';
    const a = analyze(text, { ...DEFAULT_OPTIONS, mode: 'forms', headingMode: 'off', separateWords: ['Recordings'] }, morphology).whole;
    expect(group(a.words, 'recordings')!.count).toBe(2);
    expect(group(a.words, 'record')!.forms.map((f) => f.form).sort()).toEqual(['record', 'records']);
  });

  it('never changes the number of words counted', () => {
    for (const c of [...BENCHMARK, ...HELD_OUT, ...SYSTEMATIC, ...PRECISION, ...FRESH]) {
      const exact = analyze(c.text, { ...DEFAULT_OPTIONS, headingMode: 'off' });
      const grouped = forms(c.text);
      expect(grouped.words.reduce((n, g) => n + g.count, 0)).toBe(exact.whole.wordCount);
      expect(grouped.wordCount).toBe(exact.whole.wordCount);
    }
  });
});
