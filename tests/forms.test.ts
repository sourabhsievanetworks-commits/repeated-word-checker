import { beforeAll, describe, expect, it } from 'vitest';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { analyze, DEFAULT_OPTIONS, type Group } from '@/lib/analyze';
import { createLemmatizer, type Lemmatizer } from '@/lib/lemmatizer';

let lemmatize: Lemmatizer;
beforeAll(() => {
  lemmatize = createLemmatizer(winkNLP(model) as never);
});

const run = (text: string) =>
  analyze(text, { ...DEFAULT_OPTIONS, mode: 'forms', headingMode: 'off' }, lemmatize(text)).whole;
const counts = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.key, g.count]));

describe('word forms (NLP model)', () => {
  it('groups plurals, possessives and verb forms', () => {
    const w = run("Trackers help. The tracker works. A tracker's battery. Batteries die. He ran, then runs, running daily.");
    const c = counts(w.words);
    expect(c.tracker).toBe(3);
    expect(c.battery).toBe(2);
    expect(c.run).toBe(3);
    const tracker = w.words.find((g) => g.key === 'tracker')!;
    expect(tracker.forms.map((f) => f.form).sort()).toEqual(["tracker", "tracker's", 'trackers']);
  });

  it('groups -ing nouns with their base word when both appear', () => {
    const c = counts(run('Tracking matters. We track hikers. GPS tracking is easy.').words);
    expect(c.track).toBe(3);
  });

  it('does not merge words that look different (best / good)', () => {
    const c = counts(run('The best tracker is good. A better option is good too.').words);
    expect(c.good).toBe(2);
    expect(c.best).toBe(1);
    expect(c.better).toBe(1);
  });

  it('keeps contractions as written', () => {
    const c = counts(analyze("Don't stop. Don't go.", { ...DEFAULT_OPTIONS, mode: 'forms', ignoreStopwords: false, headingMode: 'off' }, lemmatize("Don't stop. Don't go.")).whole.words);
    expect(c["don't"]).toBe(2);
  });

  it('never changes the number of words counted', () => {
    const text = `## Hiking Trackers\nHikers love trackers. Studies show hiking with trackers is safer.\nThe U.S. data were clear, e.g. 24/7 coverage. Mice and children ran; it's well-known.`;
    const exact = analyze(text, { ...DEFAULT_OPTIONS, headingMode: 'off' });
    const forms = run(text);
    const total = (gs: Group[]) => gs.reduce((n, g) => n + g.count, 0);
    expect(total(forms.words)).toBe(total(exact.whole.words));
    expect(forms.wordCount).toBe(exact.whole.wordCount);
  });
});
