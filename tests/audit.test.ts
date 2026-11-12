import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_OPTIONS, type Group } from '@/lib/analyze';
import { findCheck } from '@/lib/findCount';

const counts = (groups: Group[]) => Object.fromEntries(groups.map((g) => [g.key, g.count]));

// A deliberately awkward passage, counted by hand word by word.
const TRICKY =
  'Wi-Fi trackers use Wi-Fi. E-mail us at help@acme.com or visit www.acme.com/wi-fi-setup. ' +
  'In the US, IT teams tell us it works. The GPS-enabled tracker’s battery lasts 24 hours; ' +
  'a GPS tracker costs $129.99, not $1,299. Re-enter the code, e.g. 1234.';

describe('hand-counted audit', () => {
  const a = analyze(TRICKY, { ...DEFAULT_OPTIONS, headingMode: 'off' });

  it('finds exactly the 40 words a person would count', () => {
    expect(a.check).toEqual({ totalWords: 40, listedWords: 40, hiddenBySettings: 0, unreadCharacters: [] });
  });

  it('counts every word correctly', () => {
    expect(counts(a.whole.words)).toEqual({
      'wi-fi': 2, trackers: 1, tracker: 2, use: 1, 'e-mail': 1, us: 2, at: 1, 'help@acme.com': 1, or: 1, visit: 1,
      'www.acme.com/wi-fi-setup': 1, in: 1, the: 3, US: 1, IT: 1, teams: 1, tell: 1, it: 1, works: 1, gps: 2,
      enabled: 1, battery: 1, lasts: 1, '24': 1, hours: 1, a: 1, costs: 1, '129.99': 1, not: 1, '1,299': 1,
      're-enter': 1, code: 1, 'e.g.': 1, '1234': 1,
    });
  });

  it('produces no junk words from links, hyphens or abbreviations', () => {
    for (const junk of ['wi', 'fi', 'e', 'mail', 'www', 'com', 'acme', 'help', 'setup', 're', 'enter', 'g', '129', '99', '1', '299'])
      expect(counts(a.whole.words)[junk], junk).toBeUndefined();
  });

  it('labels names and acronyms as written, and sentence-start words in lower case', () => {
    const label = (key: string) => a.whole.words.find((g) => g.key === key)!.display;
    expect([label('wi-fi'), label('US'), label('IT'), label('gps'), label('e-mail'), label('re-enter')]).toEqual([
      'Wi-Fi', 'US', 'IT', 'GPS', 'e-mail', 're-enter',
    ]);
  });

  it('keeps the capital of a name used mid-sentence, and of "I"', () => {
    const b = analyze('Choosing is hard. We like Jiobit. Best of all, I think Paris wins. "Great," she said.', { ...DEFAULT_OPTIONS, headingMode: 'off' });
    const label = (key: string) => b.whole.words.find((g) => g.key === key)!.display;
    expect(['choosing', 'jiobit', 'best', 'i', 'paris', 'great', 'we'].map(label)).toEqual(['choosing', 'Jiobit', 'best', 'I', 'Paris', 'great', 'we']);
  });
});

describe('findCheck (what Ctrl+F shows)', () => {
  const text = 'We track it. The tracker tracks. Tracking a track.';
  const a = analyze(text, { ...DEFAULT_OPTIONS, headingMode: 'off' });
  const track = a.whole.words.find((g) => g.key === 'track')!;

  it('explains matches inside longer words', () => {
    expect(track.count).toBe(2);
    expect(findCheck(text, { start: 0, end: text.length }, 'track', track.occurrences)).toEqual({
      needle: 'track',
      total: 5,
      counted: 2,
      elsewhere: [{ word: 'tracker', count: 1 }, { word: 'tracking', count: 1 }, { word: 'tracks', count: 1 }],
    });
  });

  it('only looks inside the chosen section', () => {
    const r = findCheck(text, { start: 0, end: 12 }, 'track', track.occurrences)!;
    expect([r.total, r.counted, r.elsewhere]).toEqual([1, 1, []]);
  });

  it('agrees with the count when the word is never inside another word', () => {
    const it2 = a.whole.words.find((g) => g.key === 'we')!;
    expect(findCheck(text, { start: 0, end: text.length }, 'we', it2.occurrences)).toMatchObject({ total: 1, counted: 1, elsewhere: [] });
  });
});
