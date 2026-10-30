import type { Analysis, Group, ScopeResult } from './analyze';
import type { Settings } from './settings';

const times = (n: number) => `used ${n} ${n === 1 ? 'time' : 'times'}`;

function lines(groups: Group[], min: number): string[] {
  return groups.filter((g) => g.count >= min).map((g) => `  ${g.display} — ${times(g.count)}`);
}

function scopeReport(s: ScopeResult, settings: Settings): string {
  const out = [`${s.title} (${s.wordCount} words)`];
  const w = lines(s.words, settings.minCount);
  out.push(...(w.length ? w : ['  No repeated words']));
  if (settings.showPhrases && s.phrases.length) out.push('  Phrases:', ...lines(s.phrases, 2).map((l) => '  ' + l));
  return out.join('\n');
}

/** Plain-text report for copying into a doc or chat. */
export function buildReport(a: Analysis, settings: Settings): string {
  return [
    'REPEATED WORDS REPORT',
    '',
    scopeReport(a.whole, settings),
    '',
    'BY SECTION',
    '',
    ...a.sections.map((s) => scopeReport(s, settings) + '\n'),
  ].join('\n');
}
