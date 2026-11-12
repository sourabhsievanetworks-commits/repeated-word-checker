import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alternatives, type Thesaurus } from '@/lib/thesaurus';

const t = JSON.parse(readFileSync('public/thesaurus.json', 'utf8')) as Thesaurus;

describe('alternatives', () => {
  it('suggests synonyms for the part of speech the model saw', () => {
    expect(alternatives(t, ['use'], 'VERB')).toEqual([{ as: 'verb', words: ['apply', 'employ', 'utilize'] }]);
    expect(alternatives(t, ['buy'], 'VERB')[0].words).toEqual(['purchase']);
    expect(alternatives(t, ['big'], 'ADJ')[0].words).toEqual(['large']);
    expect(alternatives(t, ['often'], 'ADV')[0].words).toContain('frequently');
  });

  it('gives nothing rather than synonyms of the wrong kind of word', () => {
    // "common" as a noun means a park; as an adjective there is no safe synonym.
    expect(alternatives(t, ['common'], 'ADJ')).toEqual([]);
  });

  it('leaves out rare meanings', () => {
    expect(JSON.stringify(alternatives(t, ['buy']))).not.toMatch(/bribe|corrupt/);
    expect(alternatives(t, ['device'], 'NOUN')).toEqual([]);
    expect(JSON.stringify(alternatives(t, ['cheap'], 'ADJ'))).not.toMatch(/tawdry|gaudy/);
  });

  it('looks up the base word first, then other spellings, and never suggests the word itself', () => {
    expect(alternatives(t, ['purchas', 'purchase'], 'VERB')[0].words).toEqual(['buy']);
    expect(alternatives(t, ['help', 'aid'], 'VERB')[0].words).toEqual(['assist']);
  });

  it('offers each kind of word when the part of speech is unknown', () => {
    expect(alternatives(t, ['help']).map((a) => a.as)).toEqual(['noun', 'verb']);
  });

  it('is small enough to load on demand', () => {
    expect(readFileSync('public/thesaurus.json').length).toBeLessThan(600_000);
  });
});
