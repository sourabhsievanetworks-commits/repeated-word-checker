import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { baseCandidates, parseMorphology } from '@/lib/morphology';

const m = parseMorphology(JSON.parse(readFileSync('public/morphology.json', 'utf8')));
const bases = (w: string) => baseCandidates(m, w).map((c) => c.base);

describe('dictionary rules', () => {
  it('finds the base of regular and irregular forms', () => {
    expect(bases('trackers')).toContain('tracker');
    expect(bases('batteries')).toContain('battery');
    expect(bases('tracked')).toContain('track');
    expect(bases('dropping')).toContain('drop');
    expect(bases('dying')).toContain('die');
    expect(bases('ran')).toContain('run');
    expect(bases('children')).toContain('child');
    expect(bases('knives')).toContain('knife');
    expect(bases('bigger')).toContain('big');
    expect(bases('heaviest')).toContain('heavy');
    expect(bases('goes')).toContain('go');
    expect(bases('going')).toContain('go');
  });

  it('does not treat derived or look-alike words as forms', () => {
    expect(bases('tracker')).toEqual([]);
    expect(bases('parenting')).toEqual([]);
    expect(bases('evening')).not.toContain('even');
    expect(bases('tired')).not.toContain('tire');
    expect(bases('number')).not.toContain('numb');
    expect(bases('feed')).not.toContain('fee');
    expect(bases('news')).not.toContain('new');
    expect(bases('bed')).toEqual([]);
    expect(bases('this')).toEqual([]);
  });

  it('uses how often WordNet shows each word used as a verb', () => {
    expect(bases('limited')).toContain('limit');
    expect(bases('tired')).toEqual([]);
    expect(bases('gifted')).toEqual([]);
  });

  it('only uses American English words as a base', () => {
    expect(m.n.has('color')).toBe(true);
    expect(m.n.has('colour')).toBe(false);
    expect(m.v.has('organize')).toBe(true);
    expect(m.v.has('organise')).toBe(false);
  });
});

describe('isDroppable', () => {
  it('allows deleting adverbs and pure adjectives, never nouns or verbs', async () => {
    const { isDroppable } = await import('@/lib/morphology');
    for (const w of ['very', 'really', 'quickly', 'actually', 'reliable', 'Very']) expect(isDroppable(m, w), w).toBe(true);
    for (const w of ['battery', 'tracker', 'track', 'price', 'use', 'help']) expect(isDroppable(m, w), w).toBe(false);
  });
});
