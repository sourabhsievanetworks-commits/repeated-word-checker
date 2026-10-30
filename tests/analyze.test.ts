import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_OPTIONS, parseWordList, type AnalyzeOptions, type Group } from '@/lib/analyze';
import { normalizeKey } from '@/lib/tokenize';

const opts = (o: Partial<AnalyzeOptions> = {}): AnalyzeOptions => ({ ...DEFAULT_OPTIONS, ...o });
const counts = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.key, g.count]));

const BLOG = `# Best GPS Trackers

GPS trackers are useful. A good GPS tracker helps you find your car. The tracker is small.

## Battery Life

Battery life matters. The battery in this tracker lasts long, and battery life is the main reason people buy it. Battery, battery, battery!

## Price

The price is fair. Price matters less than battery life.`;

describe('analyze', () => {
  it('counts words per section and for the whole blog', () => {
    const a = analyze(BLOG, opts());
    expect(a.sections.map((s) => s.title)).toEqual(['Best GPS Trackers', 'Battery Life', 'Price']);

    expect(counts(a.sections[0].words)).toMatchObject({ gps: 2, trackers: 1, tracker: 2, useful: 1, good: 1 });
    expect(counts(a.sections[1].words)).toMatchObject({ battery: 6, life: 2, tracker: 1, matters: 1 });
    expect(counts(a.sections[2].words)).toMatchObject({ price: 2, battery: 1, life: 1, matters: 1 });
    expect(counts(a.whole.words)).toMatchObject({ battery: 7, tracker: 3, price: 2, life: 3, gps: 2 });
  });

  it('excludes heading text by default and can include it', () => {
    const without = analyze(BLOG, opts());
    expect(counts(without.sections[1].words).battery).toBe(6);
    const withH = analyze(BLOG, opts({ includeHeadings: true }));
    expect(counts(withH.sections[1].words).battery).toBe(7);
    expect(counts(withH.whole.words).battery).toBe(8);
  });

  it('counts total words including common words and numbers', () => {
    const a = analyze('The 2 cats and the dog.', opts({ headingMode: 'off' }));
    expect(a.whole.wordCount).toBe(6);
    expect(counts(a.whole.words)).toEqual({ cats: 1, dog: 1 });
  });

  it('can include common words', () => {
    const a = analyze('The cat and the dog.', opts({ ignoreStopwords: false, headingMode: 'off' }));
    expect(counts(a.whole.words)).toMatchObject({ the: 2, cat: 1, and: 1, dog: 1 });
  });

  it('honours the ignore list, including curly apostrophes and case', () => {
    const a = analyze("Garmin's Garmin GARMIN inReach", opts({ ignoreWords: parseWordList("garmin, Garmin’s"), headingMode: 'off' }));
    expect(counts(a.whole.words)).toEqual({ inreach: 1 });
  });

  it('shows the most used spelling', () => {
    const a = analyze('GPS gps GPS', opts({ headingMode: 'off' }));
    expect(a.whole.words[0]).toMatchObject({ key: 'gps', display: 'GPS', count: 3 });
  });

  it('finds repeated phrases without crossing punctuation or line breaks', () => {
    const a = analyze('best gps tracker. best gps tracker! gps tracker\nbest gps, tracker', opts({ headingMode: 'off' }));
    expect(counts(a.whole.phrases)).toEqual({ 'best gps tracker': 2, 'gps tracker': 3, 'best gps': 3 });
  });

  it('drops a short phrase when a longer phrase covers it equally', () => {
    const a = analyze('top gps tracker here. top gps tracker there.', opts({ headingMode: 'off' }));
    expect(counts(a.whole.phrases)).toEqual({ 'top gps tracker': 2 });
  });

  it('does not start or end phrases with common words', () => {
    const a = analyze('the tracker is the tracker is', opts({ headingMode: 'off' }));
    expect(a.whole.phrases.map((p) => p.key)).toEqual([]);
    const b = analyze('cost of living. cost of living.', opts({ headingMode: 'off' }));
    expect(counts(b.whole.phrases)).toEqual({ 'cost of living': 2 });
  });

  it('every highlight position points at the counted word', () => {
    const a = analyze(BLOG, opts());
    for (const scope of [a.whole, ...a.sections])
      for (const g of scope.words) {
        expect(g.occurrences.length).toBe(g.count);
        for (const o of g.occurrences) expect(normalizeKey(BLOG.slice(o.start, o.end))).toBe(g.key);
      }
  });

  it('section counts add up to the whole-blog count', () => {
    const a = analyze(BLOG, opts());
    const sum: Record<string, number> = {};
    for (const s of a.sections) for (const g of s.words) sum[g.key] = (sum[g.key] ?? 0) + g.count;
    expect(sum).toEqual(counts(a.whole.words));
    expect(a.sections.reduce((n, s) => n + s.wordCount, 0)).toBe(a.whole.wordCount);
  });
});

// Independent reference: on letters-only text, a word is a maximal run of A-Z.
function referenceCounts(text: string): Record<string, number> {
  const c: Record<string, number> = {};
  for (const w of text.toLowerCase().split(/[^a-z]+/).filter(Boolean)) c[w] = (c[w] ?? 0) + 1;
  return c;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('randomised cross-check against an independent counter', () => {
  const vocab = ['tracker', 'GPS', 'battery', 'Hiking', 'trail', 'map', 'signal', 'device', 'safety', 'Alert', 'route', 'x'];
  const seps = [' ', '  ', ', ', '. ', '! ', '? ', '\n', '\n\n', ' - ', ' — ', ' (', ') ', '; ', ': ', '"', '\t'];

  for (let run = 0; run < 300; run++) {
    it(`run ${run}`, () => {
      const r = rng(run + 1);
      let text = '';
      const n = 1 + Math.floor(r() * 400);
      for (let i = 0; i < n; i++) {
        let w = vocab[Math.floor(r() * vocab.length)];
        if (r() < 0.2) w = w.toUpperCase();
        text += w + seps[Math.floor(r() * seps.length)];
      }
      const a = analyze(text, opts({ ignoreStopwords: false, headingMode: 'off' }));
      const ref = referenceCounts(text);
      expect(counts(a.whole.words)).toEqual(ref);
      expect(a.whole.wordCount).toBe(Object.values(ref).reduce((x, y) => x + y, 0));
    });
  }
});
