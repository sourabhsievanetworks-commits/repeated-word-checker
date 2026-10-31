'use client';

import { useState } from 'react';
import type { Analysis, Group, ScopeResult } from '@/lib/analyze';
import { severity, type Settings, type Severity } from '@/lib/settings';
import WordTable from './WordTable';

export interface Selection {
  scopeId: string;
  kind: 'word' | 'phrase';
  key: string;
}

type Tab = 'sections' | 'table' | 'overused';

interface Props {
  analysis: Analysis;
  settings: Settings;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

const times = (n: number) => `used ${n} ${n === 1 ? 'time' : 'times'}`;

export default function Results({ analysis, settings, selection, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('sections');

  const separateCommon = settings.commonWords === 'separate';
  // Common words and numbers are counted and listed, but not flagged.
  const isCommon = (g: Group) => separateCommon && (g.common || g.number);
  const sectionSev = (g: Group): Severity => (isCommon(g) ? 'common' : severity(g.count, settings.sectionWarn, settings.sectionHigh));
  const wholeSev = (g: Group): Severity => (isCommon(g) ? 'common' : severity(g.count, settings.wholeWarn, settings.wholeHigh));

  const overused = analysis.sections.flatMap((s) =>
    s.words.filter((g) => !isCommon(g) && sectionSev(g) !== 'ok').map((g) => ({ scope: s, group: g })),
  );
  overused.sort((a, b) => b.group.count - a.group.count);
  const overusedWhole = analysis.whole.words.filter((g) => !isCommon(g) && wholeSev(g) !== 'ok');

  const isSelected = (scopeId: string, kind: Selection['kind'], key: string) =>
    selection?.scopeId === scopeId && selection.kind === kind && selection.key === key;

  const row = (scope: ScopeResult, kind: Selection['kind'], g: Group, sev: Severity, where?: string) => (
    <li key={`${scope.id}:${kind}:${g.key}`}>
      <button
        type="button"
        className={`row sev-${sev}`}
        aria-pressed={isSelected(scope.id, kind, g.key)}
        onClick={() => onSelect({ scopeId: scope.id, kind, key: g.key })}
        title="Show every place this is used"
      >
        <span className="word">{g.display}</span>
        <span className="count">{times(g.count)}</span>
        {kind === 'word' && scope.wordCount > 0 && (
          <span className="density">{((g.count / scope.wordCount) * 100).toFixed(1)}%</span>
        )}
        {where && <span className="where">in {where}</span>}
        {g.forms.length > 1 && (
          <span className="forms">{g.forms.map((f) => `${f.form} ×${f.count}`).join(' · ')}</span>
        )}
      </button>
    </li>
  );

  /** Compact clickable chips for long lists (common words, words used once). */
  const chips = (scope: ScopeResult, groups: Group[]) => (
    <div className="chips">
      {groups.map((g) => (
        <button
          key={g.key}
          type="button"
          className="chip"
          aria-pressed={isSelected(scope.id, 'word', g.key)}
          onClick={() => onSelect({ scopeId: scope.id, kind: 'word', key: g.key })}
        >
          {g.display} <b>×{g.count}</b>
        </button>
      ))}
    </div>
  );

  const scopeBody = (s: ScopeResult, sev: (g: Group) => Severity) => {
    const common = s.words.filter((g) => isCommon(g) && !g.number);
    const numbers = s.words.filter((g) => isCommon(g) && g.number);
    const rest = s.words.filter((g) => !isCommon(g));
    const repeated = rest.filter((g) => g.count >= 2);
    const once = rest.filter((g) => g.count === 1);
    const sum = (gs: Group[]) => gs.reduce((n, g) => n + g.count, 0);
    return (
      <>
        {repeated.length ? (
          <ul className="rows">{repeated.map((g) => row(s, 'word', g, sev(g)))}</ul>
        ) : (
          <p className="muted small">No word is repeated here.</p>
        )}
        {settings.showPhrases && s.phrases.length > 0 && (
          <>
            <h4 className="minor">Repeated phrases</h4>
            <ul className="rows">{s.phrases.map((g) => row(s, 'phrase', g, sev(g)))}</ul>
          </>
        )}
        {common.length > 0 && (
          <details className="more">
            <summary>
              Common words: {common.length} different, {sum(common)} uses
            </summary>
            {chips(s, common)}
          </details>
        )}
        {numbers.length > 0 && (
          <details className="more">
            <summary>
              Numbers: {numbers.length} different, {sum(numbers)} uses
            </summary>
            {chips(s, numbers)}
          </details>
        )}
        {once.length > 0 && (
          <details className="more">
            <summary>Used only once: {once.length} words</summary>
            {chips(s, once)}
          </details>
        )}
      </>
    );
  };

  const { check } = analysis;

  return (
    <div className="results-body">
      <div className={`coverage ${check.unreadCharacters.length ? 'bad' : ''}`}>
        {check.unreadCharacters.length ? (
          <>
            Warning: {check.unreadCharacters.length} letters were not read ({check.unreadCharacters.slice(0, 10).join(' ')}). Please report this text.
          </>
        ) : (
          <>
            <strong>✓ All {check.totalWords.toLocaleString()} words read.</strong>{' '}
            {check.hiddenBySettings === 0
              ? `Every one is counted below (the counts add up to ${check.listedWords.toLocaleString()}).`
              : `${check.listedWords.toLocaleString()} counted below; ${check.hiddenBySettings.toLocaleString()} left out by your settings.`}
          </>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}>
          By section <span className="tag">{analysis.sections.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'table'} onClick={() => setTab('table')}>
          Table <span className="tag">{analysis.whole.words.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'overused'} onClick={() => setTab('overused')}>
          Overused <span className={`tag ${overused.length + overusedWhole.length ? 'tag-high' : ''}`}>{overused.length + overusedWhole.length}</span>
        </button>
      </div>

      <p className="legend">
        <span className="dot sev-ok" /> fine
        <span className="dot sev-warn" /> repetitive
        <span className="dot sev-high" /> overused
        <span className="muted"> · Click any word to see every place it is used.</span>
      </p>

      {tab === 'sections' &&
        analysis.sections.map((s) => {
          const flagged = s.words.filter((g) => !isCommon(g) && sectionSev(g) !== 'ok').length;
          return (
            <article key={s.id} className="card">
              <header className="card-head">
                <span className="level">{s.level ? `H${s.level}` : 'Intro'}</span>
                <h3>{s.title}</h3>
                <span className="meta">{s.wordCount} words</span>
                {flagged > 0 && <span className="pill">{flagged} to fix</span>}
              </header>
              {(s.h1 || (s.subheadings && s.subheadings.length > 0)) && (
                <p className="card-sub">
                  {s.h1 && <>H1: {s.h1}</>}
                  {s.h1 && s.subheadings?.length ? ' · ' : ''}
                  {s.subheadings?.length ? <>Includes: {s.subheadings.join(' · ')}</> : null}
                </p>
              )}
              {scopeBody(s, sectionSev)}
            </article>
          );
        })}

      {tab === 'overused' && (
        <>
          <article className="card">
            <header className="card-head">
              <h3>Inside sections</h3>
              <span className="meta">{settings.sectionWarn}+ times in one section</span>
            </header>
            {overused.length ? (
              <ul className="rows">{overused.map(({ scope, group }) => row(scope, 'word', group, sectionSev(group), scope.title))}</ul>
            ) : (
              <p className="muted small">No word is used {settings.sectionWarn} or more times in any one section.</p>
            )}
          </article>
          <article className="card">
            <header className="card-head">
              <h3>Across the whole blog</h3>
              <span className="meta">{settings.wholeWarn}+ times in total</span>
            </header>
            {overusedWhole.length ? (
              <ul className="rows">{overusedWhole.map((g) => row(analysis.whole, 'word', g, wholeSev(g)))}</ul>
            ) : (
              <p className="muted small">No word is used {settings.wholeWarn} or more times in the blog.</p>
            )}
          </article>
        </>
      )}

      {tab === 'table' && <WordTable analysis={analysis} settings={settings} selection={selection} onSelect={onSelect} />}
    </div>
  );
}
