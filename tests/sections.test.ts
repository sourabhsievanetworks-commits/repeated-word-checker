import { describe, expect, it } from 'vitest';
import { splitSections } from '@/lib/sections';

const titles = (s: string, mode: 'auto' | 'markdown' | 'off' = 'auto') => splitSections(s, mode).map((x) => x.title);

describe('splitSections', () => {
  it('splits on markdown headings and keeps the intro', () => {
    const text = 'Intro text here.\n\n## First\nBody one.\n\n### Sub ###\nBody two.\n# Third\nBody three.';
    const s = splitSections(text, 'auto');
    expect(s.map((x) => [x.title, x.level])).toEqual([
      ['Introduction (before first heading)', 0], ['First', 2], ['Sub', 3], ['Third', 1],
    ]);
    expect(text.slice(s[1].bodyStart, s[1].bodyEnd).trim()).toBe('Body one.');
    expect(text.slice(s[3].bodyStart, s[3].bodyEnd).trim()).toBe('Body three.');
  });

  it('covers every character exactly once', () => {
    const text = 'a\n## b\nc\n## d\ne';
    const s = splitSections(text);
    expect(s[0].bodyStart).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i].headingStart).toBe(s[i - 1].bodyEnd);
    expect(s[s.length - 1].bodyEnd).toBe(text.length);
  });

  it('skips the intro when there is no text before the first heading', () => {
    expect(titles('\n## Only\nText.')).toEqual(['Only']);
  });

  it('ignores # lines inside code fences and hashtags', () => {
    expect(titles('## Real\n```\n# not a heading\n```\n#hashtag text.')).toEqual(['Real']);
  });

  it('detects plain-text headings between paragraphs', () => {
    const text = [
      'Best GPS Trackers for Hiking',
      'GPS trackers help hikers stay safe on long trails.',
      '',
      'What Is a GPS Tracker?',
      'A GPS tracker is a small device that reports its location.',
      '',
      'Battery Life',
      'Most trackers last a week on one charge.',
    ].join('\n');
    expect(titles(text)).toEqual(['Best GPS Trackers for Hiking', 'What Is a GPS Tracker?', 'Battery Life']);
  });

  it('detects a heading right after a bulleted list', () => {
    const text = [
      '1. Jiobit Smart Tag – Best Overall',
      'The Jiobit is tiny and lasts up to 7 days.',
      '• Real-time location',
      '• Price: $129.99 + $8.99/month',
      '2. AngelSense – Best for Special Needs',
      'AngelSense is built for kids with autism.',
    ].join('\n');
    expect(titles(text)).toEqual(['1. Jiobit Smart Tag – Best Overall', '2. AngelSense – Best for Special Needs']);
  });

  it('does not treat list items as headings', () => {
    const text = [
      'Key features to look for:',
      'Long battery life',
      'Waterproof case',
      'Two-way messaging',
      'These matter most on long trips.',
    ].join('\n');
    expect(titles(text)).toEqual(['Full text']);
  });

  it('prefers markdown headings when present', () => {
    expect(titles('## Real\nSome text.\n\nLooks Like Heading\nA full sentence follows here.')).toEqual(['Real']);
  });

  it('returns one section when detection is off', () => {
    expect(titles('## A\nx\n## B\ny', 'off')).toEqual(['Full text']);
  });
});
