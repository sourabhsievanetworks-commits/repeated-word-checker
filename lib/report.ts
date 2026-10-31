import type { Analysis, Group, ScopeResult } from './analyze';
import type { Settings } from './settings';

const times = (n: number) => `used ${n} ${n === 1 ? 'time' : 'times'}`;

function lines(groups: Group[]): string[] {
  return groups.map((g) => `  ${g.display} — ${times(g.count)}`);
}

function scopeReport(s: ScopeResult, settings: Settings): string {
  const out = [`${s.title} (${s.wordCount} words)`];
  out.push(...(s.words.length ? lines(s.words) : ['  No words']));
  if (settings.showPhrases && s.phrases.length) out.push('  Repeated phrases:', ...lines(s.phrases).map((l) => '  ' + l));
  return out.join('\n');
}

/** Plain-text report of every word, for copying into a doc or chat. */
export function buildReport(a: Analysis, settings: Settings): string {
  return [
    'REPEATED WORDS REPORT',
    `${a.check.totalWords} words read, ${a.check.listedWords} counted below, ${a.check.hiddenBySettings} left out by settings.`,
    '',
    scopeReport(a.whole, settings),
    '',
    'BY SECTION',
    '',
    ...a.sections.map((s) => scopeReport(s, settings) + '\n'),
  ].join('\n');
}
