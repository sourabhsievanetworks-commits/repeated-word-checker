'use client';

import { useState } from 'react';
import type { Analysis, Group, ScopeResult } from '@/lib/analyze';
import { severity, type Settings, type Severity } from '@/lib/settings';

export interface Selection {
  scopeId: string;
  kind: 'word' | 'phrase';
  key: string;
}

type Tab = 'overused' | 'sections' | 'whole';

interface Props {
  analysis: Analysis;
  settings: Settings;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
}

const times = (n: number) => `used ${n} ${n === 1 ? 'time' : 'times'}`;

export default function Results({ analysis, settings, selection, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('sections');

  const sectionSev = (n: number) => severity(n, settings.sectionWarn, settings.sectionHigh);
  const wholeSev = (n: number) => severity(n, settings.wholeWarn, settings.wholeHigh);

  const overused = analysis.sections.flatMap((s) =>
    s.words.filter((g) => sectionSev(g.count) !== 'ok').map((g) => ({ scope: s, group: g })),
  );
  overused.sort((a, b) => b.group.count - a.group.count);
  const overusedWhole = analysis.whole.words.filter((g) => wholeSev(g.count) !== 'ok');

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

  const scopeBody = (s: ScopeResult, sev: (n: number) => Severity) => {
    const words = s.words.filter((g) => g.count >= settings.minCount);
    return (
      <>
        {words.length ? (
          <ul className="rows">{words.map((g) => row(s, 'word', g, sev(g.count)))}</ul>
        ) : (
          <p className="muted small">No word is used {settings.minCount} or more times here.</p>
        )}
        {settings.showPhrases && s.phrases.length > 0 && (
          <>
            <h4 className="minor">Repeated phrases</h4>
            <ul className="rows">{s.phrases.map((g) => row(s, 'phrase', g, sev(g.count)))}</ul>
          </>
        )}
      </>
    );
  };

  return (
    <div className="results-body">
      <div className="tabs" role="tablist">
        <button role="tab" type="button" aria-selected={tab === 'sections'} onClick={() => setTab('sections')}>
          By section <span className="tag">{analysis.sections.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'overused'} onClick={() => setTab('overused')}>
          Overused <span className={`tag ${overused.length + overusedWhole.length ? 'tag-high' : ''}`}>{overused.length + overusedWhole.length}</span>
        </button>
        <button role="tab" type="button" aria-selected={tab === 'whole'} onClick={() => setTab('whole')}>
          Whole blog
        </button>
      </div>

      <p className="legend">
        <span className="dot sev-ok" /> fine
        <span className="dot sev-warn" /> repetitive
        <span className="dot sev-high" /> overused
        <span className="muted"> · Click any word to see where it is used.</span>
      </p>

      {tab === 'sections' &&
        analysis.sections.map((s) => {
          const flagged = s.words.filter((g) => sectionSev(g.count) !== 'ok').length;
          return (
            <article key={s.id} className="card">
              <header className="card-head">
                <span className="level">{s.level ? `H${s.level}` : 'Intro'}</span>
                <h3>{s.title}</h3>
                <span className="meta">{s.wordCount} words</span>
                {flagged > 0 && <span className="pill">{flagged} to fix</span>}
              </header>
              {scopeBody(s, sectionSev)}
            </article>
          );
        })}

      {tab === 'overused' && (
        <>
          <article className="card">
            <header className="card-head">
              <h3>Inside sections</h3>
              <span className="meta">
                {settings.sectionWarn}+ times in one section
              </span>
            </header>
            {overused.length ? (
              <ul className="rows">{overused.map(({ scope, group }) => row(scope, 'word', group, sectionSev(group.count), scope.title))}</ul>
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
              <ul className="rows">{overusedWhole.map((g) => row(analysis.whole, 'word', g, wholeSev(g.count)))}</ul>
            ) : (
              <p className="muted small">No word is used {settings.wholeWarn} or more times in the blog.</p>
            )}
          </article>
        </>
      )}

      {tab === 'whole' && (
        <article className="card">
          <header className="card-head">
            <h3>Whole blog</h3>
            <span className="meta">
              {analysis.whole.wordCount} words · {analysis.whole.words.length} different words
            </span>
          </header>
          {scopeBody(analysis.whole, wholeSev)}
        </article>
      )}
    </div>
  );
}
