import { describe, expect, it } from 'vitest';
import { tokenize, uncountedCharacters } from '@/lib/tokenize';

const keys = (s: string, splitHyphens = false) => tokenize(s, { splitHyphens }).map((t) => t.key);

describe('tokenize', () => {
  it('splits plain words and ignores punctuation', () => {
    expect(keys('Hello, world! This is (a) test.')).toEqual(['hello', 'world', 'this', 'is', 'a', 'test']);
  });

  it('is case-insensitive', () => {
    expect(keys('Tracker TRACKER tracker')).toEqual(['tracker', 'tracker', 'tracker']);
  });

  it('keeps contractions and possessives as one word, with straight or curly apostrophes', () => {
    expect(keys("don't it’s tracker's trackers’")).toEqual(["don't", "it's", "tracker's", 'trackers']);
  });

  it('keeps hyphenated words whole but splits on dashes', () => {
    expect(keys('real-time co-founder GPS‑enabled 2020–2024 yes — no')).toEqual([
      'real-time', 'co-founder', 'gps-enabled', '2020', '2024', 'yes', 'no',
    ]);
  });

  it('splits hyphenated words into parts by default', () => {
    expect(tokenize('real-time GPS‑enabled co-founder').map((t) => t.key)).toEqual(['real', 'time', 'gps', 'enabled', 'co', 'founder']);
  });

  it('reads every letter and digit in any script (randomised)', () => {
    const pool = [
      ...'abcXYZéÉñßøåçÆœ', ...'абвгдЖЗ', ...'αβγΩ', ...'אבג', ...'عرب', ...'हिन्दी', ...'中文字日本語', ...'한국어', ...'0123456789',
      ...' \t\n.,;:!?"\'’‘-‐‑–—()[]{}/\\@#$%^&*+=<>|~`_', '\u00AD', '\u200B', '\u200C', '\u200D', '\u00A0', '\u0301', '😀', '👍🏽', '™', '©', '½', '²',
    ];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    for (let run = 0; run < 500; run++) {
      let s = '';
      const n = Math.floor(rnd() * 300);
      for (let i = 0; i < n; i++) s += pool[Math.floor(rnd() * pool.length)];
      for (const splitHyphens of [true, false]) {
        const tokens = tokenize(s, { splitHyphens });
        expect(uncountedCharacters(s, tokens)).toEqual([]);
        for (const t of tokens) expect(s.slice(t.start, t.end)).toBe(t.text);
      }
    }
  });

  it('keeps dotted abbreviations whole', () => {
    expect(keys('Made in the U.S. e.g. today')).toEqual(['made', 'in', 'the', 'u.s.', 'e.g.', 'today']);
  });

  it('keeps accented and non-Latin words whole', () => {
    expect(keys('Café naïve résumé niño Москва')).toEqual(['café', 'naïve', 'résumé', 'niño', 'москва']);
  });

  it('treats decomposed accents the same as composed ones', () => {
    expect(keys('café café')).toEqual(['café', 'café']);
  });

  it('ignores soft hyphens and zero-width joiners inside words', () => {
    expect(keys('track­er tracker')).toEqual(['tracker', 'tracker']);
  });

  it('marks numbers as not words for repetition', () => {
    const t = tokenize('Top 10 trackers in 2024 cost 3.5 dollars and 4G works');
    expect(t.filter((x) => !x.hasLetter).map((x) => x.text)).toEqual(['10', '2024', '3.5']);
    expect(t.find((x) => x.text === '4G')!.hasLetter).toBe(true);
  });

  it('keeps prices, decimals and thousands together', () => {
    expect(keys('$129.99 + $8.99/month, 1.5" and 2,000 units; ends 2019.')).toEqual(['129.99', '8.99', 'month', '1.5', 'and', '2,000', 'units', 'ends', '2019']);
  });

  it('reports exact offsets', () => {
    const s = '  Hi there,\nfriend.';
    for (const t of tokenize(s)) expect(s.slice(t.start, t.end)).toBe(t.text);
  });

  it('marks breaks at punctuation and line breaks only', () => {
    const t = tokenize('gps tracker, gps\ntracker gps  tracker');
    expect(t.map((x) => x.breakBefore)).toEqual([true, false, true, true, false, false]);
  });
});
