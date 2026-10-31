import { describe, expect, it } from 'vitest';
import { sectionsFromHeadings, splitSections } from '@/lib/sections';

const titles = (s: string, mode: 'auto' | 'markdown' | 'off' = 'auto') => splitSections(s, mode).map((x) => x.title);

describe('sections: Introduction + one per H2', () => {
  const BLOG = '# Best Trackers\nIntro text.\n\n## First\nBody one.\n\n### Sub A\nSub body.\n#### Deeper\nMore.\n## Second\nBody two.';

  it('makes the H1 and its text the introduction, then one section per H2', () => {
    const s = splitSections(BLOG);
    expect(s.map((x) => [x.title, x.level])).toEqual([['Introduction', 0], ['First', 2], ['Second', 2]]);
    expect(s[0].h1).toBe('Best Trackers');
  });

  it('keeps H3-H6 inside their H2 section', () => {
    const s = splitSections(BLOG);
    expect(s[1].subheadings.map((h) => [h.level, h.title])).toEqual([[3, 'Sub A'], [4, 'Deeper']]);
    expect(BLOG.slice(s[1].start, s[1].end)).toContain('Sub body.');
    expect(BLOG.slice(s[1].start, s[1].end)).toContain('More.');
  });

  it('covers every character exactly once', () => {
    for (const text of [BLOG, 'text before\n# Title\nx\n## A\ny', '## A\nx\n## B\ny', 'no headings at all']) {
      const s = splitSections(text);
      expect(s[0].start).toBe(0);
      for (let i = 1; i < s.length; i++) expect(s[i].start).toBe(s[i - 1].end);
      expect(s[s.length - 1].end).toBe(text.length);
    }
  });

  it('puts text before the H1 into the introduction', () => {
    const s = splitSections('Kicker line.\n# Title\nIntro.\n## A\nBody.');
    expect(s.map((x) => x.title)).toEqual(['Introduction', 'A']);
    expect(s[0].start).toBe(0);
  });

  it('starts with the first H2 when there is no H1 or intro text', () => {
    expect(titles('\n## Only\nText.')).toEqual(['Only']);
  });

  it('uses H3 as the section level when there is no H2', () => {
    expect(titles('# T\nIntro.\n### A\nx\n### B\ny')).toEqual(['Introduction', 'A', 'B']);
  });

  it('splits at each H1 when the text only has H1s', () => {
    expect(titles('# One\nx\n# Two\ny')).toEqual(['One', 'Two']);
  });

  it('ignores # lines inside code fences and hashtags', () => {
    expect(titles('## Real\n```\n# not a heading\n```\n#hashtag text.')).toEqual(['Real']);
  });

  it('detects plain-text headings, with the first line as the H1 title', () => {
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
    const s = splitSections(text);
    expect(s.map((x) => x.title)).toEqual(['Introduction', 'What Is a GPS Tracker?', 'Battery Life']);
    expect(s[0].h1).toBe('Best GPS Trackers for Hiking');
  });

  it('detects a heading right after a bulleted list', () => {
    const text = [
      'Intro paragraph that is a full sentence.',
      '1. Jiobit Smart Tag – Best Overall',
      'The Jiobit is tiny and lasts up to 7 days.',
      '• Real-time location',
      '• Price: $129.99 + $8.99/month',
      '2. AngelSense – Best for Special Needs',
      'AngelSense is built for kids with autism.',
    ].join('\n');
    expect(titles(text)).toEqual(['Introduction', '1. Jiobit Smart Tag – Best Overall', '2. AngelSense – Best for Special Needs']);
  });

  it('does not treat list items as headings', () => {
    const text = ['Key features to look for:', 'Long battery life', 'Waterproof case', 'These matter most on long trips.'].join('\n');
    expect(titles(text)).toEqual(['Full text']);
  });

  it('returns one section when splitting is off', () => {
    expect(titles('## A\nx\n## B\ny', 'off')).toEqual(['Full text']);
  });

  it('builds sections from editor headings', () => {
    const text = 'Title\nIntro.\nA\nBody.\nSub\nMore.';
    const s = sectionsFromHeadings(text, [
      { title: 'Title', level: 1, start: 0, end: 5 },
      { title: 'A', level: 2, start: 13, end: 14 },
      { title: 'Sub', level: 3, start: 21, end: 24 },
    ]);
    expect(s.map((x) => [x.title, x.start, x.end])).toEqual([['Introduction', 0, 13], ['A', 13, text.length]]);
    expect(s[1].subheadings.map((h) => h.title)).toEqual(['Sub']);
  });
});
