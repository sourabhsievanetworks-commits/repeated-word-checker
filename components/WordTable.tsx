'use client';

import { useMemo, useState } from 'react';
import type { Analysis, Group } from '@/lib/analyze';
import { normalizeKey } from '@/lib/tokenize';
import { severity, type Settings } from '@/lib/settings';
import type { Selection } from './Results';

interface Props {
  analysis: Analysis;
  settings: Settings;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

type Show = 'repeated' | 'all';

/**
 * Every word (or phrase) as a row, with one column per section. Counts per
 * section come from the word's own positions, so each row adds up to its total.
 */
export default function WordTable({ analysis, settings, selection, onSelect }: Props) {
  const [kind, setKind] = useState<'word' | 'phrase'>('word');
  const [show, setShow] = useState<Show>('repeated');
  const [hideCommon, setHideCommon] = useState(false);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const sections = analysis.sections;
  const sectionOf = useMemo(() => {
    const starts = sections.map((s) => s.start);
    return (pos: number) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= pos) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
  }, [sections]);

  const rows = useMemo(() => {
    const groups = kind === 'word' ? analysis.whole.words : analysis.whole.phrases;
    return groups.map((g) => {
      const per = sections.map(() => 0);
      for (const o of g.occurrences) per[sectionOf(o.start)]++;
      return { g, per };
    });
  }, [analysis, kind, sections, sectionOf]);

  const q = normalizeKey(query.trim());
  const quiet = (g: Group) => g.common || g.number;
  const visible = rows.filter(
    ({ g }) =>
      (show === 'all' || g.count >= 2) &&
      !(hideCommon && quiet(g)) &&
      (!q || g.key.includes(q) || g.forms.some((f) => f.form.includes(q))),
  );

  const flag = (g: Group, n: number, warn: number, high: number) =>
    settings.commonWords === 'separate' && quiet(g) ? 'common' : severity(n, warn, high);

  const colTotals = sections.map((_, i) => visible.reduce((n, r) => n + r.per[i], 0));
  const grand = visible.reduce((n, r) => n + r.g.count, 0);
  const complete = kind === 'word' && show === 'all' && !hideCommon && !q;

  const copyTable = async () => {
    const head = ['Word', 'Total', ...sections.map((s) => s.title)];
    const lines = [head, ...visible.map(({ g, per }) => [g.display, String(g.count), ...per.map(String)])];
    try {
      await navigator.clipboard.writeText(lines.map((l) => l.map((c) => c.replace(/\t|\n/g, ' ')).join('\t')).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const isSel = (scopeId: string, key: string) =>
    selection?.scopeId === scopeId && selection.kind === kind && selection.key === key;

  return (
    <article className="card">
      <div className="table-tools">
        <div className="seg small" role="radiogroup" aria-label="Words or phrases">
          <button type="button" role="radio" aria-checked={kind === 'word'} onClick={() => setKind('word')}>
            Words
          </button>
          <button type="button" role="radio" aria-checked={kind === 'phrase'} onClick={() => setKind('phrase')}>
            Phrases
          </button>
        </div>
        <div className="seg small" role="radiogroup" aria-label="Which rows">
          <button type="button" role="radio" aria-checked={show === 'repeated'} onClick={() => setShow('repeated')}>
            Repeated (2+)
          </button>
          <button type="button" role="radio" aria-checked={show === 'all'} onClick={() => setShow('all')}>
            All
          </button>
        </div>
        <label className="check small">
          <input type="checkbox" checked={hideCommon} onChange={(e) => setHideCommon(e.target.checked)} />
          Hide common words &amp; numbers
        </label>
        <button type="button" className="btn ghost sm" onClick={copyTable}>
          {copied ? 'Copied' : 'Copy for Google Sheets'}
        </button>
      </div>
      <input className="search" type="search" placeholder="Find a word…" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="table-wrap matrix-wrap">
        <table className="words matrix">
          <thead>
            <tr>
              <th className="sticky-col">{kind === 'word' ? 'Word' : 'Phrase'}</th>
              <th className="num">Total</th>
              {sections.map((s) => (
                <th key={s.id} className="num sec" title={s.h1 ? `Introduction (H1: ${s.h1})` : s.title}>
                  <span className="lvl">{s.level ? `H${s.level}` : 'Intro'}</span>
                  <span className="sec-title">{s.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ g, per }) => (
              <tr key={g.key} aria-selected={isSel('all', g.key)}>
                <td className="sticky-col">
                  <button type="button" className="linkish" onClick={() => onSelect({ scopeId: 'all', kind, key: g.key })}>
                    {g.display}
                  </button>
                  {g.forms.length > 1 && <div className="forms">{g.forms.map((f) => `${f.form} ×${f.count}`).join(' · ')}</div>}
                </td>
                <td className={`num total sev-${flag(g, g.count, settings.wholeWarn, settings.wholeHigh)}`}>{g.count}</td>
                {per.map((n, i) => (
                  <td
                    key={sections[i].id}
                    className={`num cell sev-${n ? flag(g, n, settings.sectionWarn, settings.sectionHigh) : 'zero'}`}
                    onClick={n ? () => onSelect({ scopeId: sections[i].id, kind, key: g.key }) : undefined}
                    title={n ? `Show the ${n} in “${sections[i].title}”` : undefined}
                  >
                    {n || '·'}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={sections.length + 2} className="muted">
                  {q ? `“${query}” is not in the text.` : kind === 'phrase' ? 'No phrase is used twice.' : 'No word is used twice.'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col">{complete ? 'Words in section' : 'Total of rows shown'}</td>
              <td className="num">{grand}</td>
              {colTotals.map((n, i) => (
                <td key={sections[i].id} className="num">
                  {n}
                </td>
              ))}
            </tr>
            {complete && (
              <tr className="check-row">
                <td className="sticky-col" colSpan={sections.length + 2}>
                  {analysis.check.hiddenBySettings === 0 && colTotals.every((n, i) => n === sections[i].wordCount)
                    ? `✓ Every column adds up to that section’s word count, and the total is the full ${analysis.check.totalWords} words.`
                    : `${analysis.check.hiddenBySettings} words are left out by your settings.`}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      <p className="muted small">
        Click a word to see it in the whole blog, or click a number to see it in that section. Copy the table and paste it into Google Sheets or
        Excel.
      </p>
    </article>
  );
}
