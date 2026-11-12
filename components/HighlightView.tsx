'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Group, ScopeResult } from '@/lib/analyze';
import type { DocModel, Range } from '@/lib/document';
import { findCheck } from '@/lib/findCount';
import { alternatives, loadThesaurus, type Alternatives } from '@/lib/thesaurus';

interface Props {
  doc: DocModel;
  group: Group;
  scope: ScopeResult;
  kind: 'word' | 'phrase';
  /** How many times each word is already used in the blog. */
  usage: Map<string, number>;
  /** Count this spelling on its own from now on (word-forms mode). */
  onSeparate?: (spelling: string) => void;
  onClose: () => void;
}

interface Mark extends Range {
  /** Occurrence indexes inside this mark (overlapping phrase matches merge). */
  occ: number[];
}

function marksFor(group: Group): Mark[] {
  const marks: Mark[] = [];
  group.occurrences.forEach((o, i) => {
    const last = marks[marks.length - 1];
    if (last && o.start < last.end) {
      last.end = Math.max(last.end, o.end);
      last.occ.push(i);
    } else marks.push({ start: o.start, end: o.end, occ: [i] });
  });
  return marks;
}

/** Shows the blog with its real headings, lists and tables, every use of the word highlighted. */
export default function HighlightView({ doc, group, scope, kind, usage, onSeparate, onClose }: Props) {
  const [active, setActive] = useState(0);
  const [options, setOptions] = useState<Alternatives[]>([]);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const marks = useMemo(() => marksFor(group), [group]);
  const n = group.occurrences.length;

  useEffect(() => setActive(0), [group.key, scope.id]);
  useEffect(() => {
    markRefs.current.get(active)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, marks]);

  // Suggested alternatives for this word (not for phrases, common words or numbers).
  useEffect(() => {
    setOptions([]);
    if (kind !== 'word' || group.common || group.number || group.link) return;
    let current = true;
    loadThesaurus()
      .then((t) => current && setOptions(alternatives(t, [group.key, ...group.forms.map((f) => f.form)])))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [group.key, group.forms, group.common, group.number, group.link, kind]);

  const closeCount = group.closeAt.filter(Boolean).length;

  // What Find (Ctrl+F) would show for this word, and where the difference comes from.
  const find = useMemo(
    () => (kind === 'word' && !group.link ? findCheck(doc.text, scope, group.display, group.occurrences) : null),
    [doc.text, scope, group, kind],
  );
  const splittable = kind === 'word' && onSeparate ? group.forms.filter((f) => f.form !== group.key) : [];

  const step = (d: number) => setActive((a) => (a + d + n) % n);

  /** Text of [start, end) with highlights; text outside the chosen section is dimmed. */
  const render = (start: number, end: number) => {
    const out: React.ReactNode[] = [];
    let at = start;
    const plain = (a: number, b: number) => {
      if (b <= a) return;
      const inScope = a >= scope.start && b <= scope.end;
      out.push(
        <span key={`t${a}`} className={inScope ? undefined : 'dim'}>
          {doc.text.slice(a, b)}
        </span>,
      );
    };
    for (const m of marks) {
      if (m.end <= start || m.start >= end) continue;
      plain(at, Math.max(at, m.start));
      const a = Math.max(m.start, start);
      const b = Math.min(m.end, end);
      out.push(
        <mark
          key={`m${a}`}
          ref={(el) => {
            for (const i of m.occ) {
              if (el) markRefs.current.set(i, el);
              else markRefs.current.delete(i);
            }
          }}
          className={[m.occ.includes(active) && 'active', m.occ.some((i) => group.closeAt[i]) && 'close'].filter(Boolean).join(' ') || undefined}
          title={m.occ.some((i) => group.closeAt[i]) ? 'Close to another use of this word' : undefined}
          onClick={() => setActive(m.occ[0])}
        >
          {doc.text.slice(a, b)}
          <sup>{m.occ[0] + 1}</sup>
        </mark>,
      );
      at = b;
    }
    plain(at, end);
    return out;
  };

  return (
    <div className="highlight">
      <div className="hl-bar">
        <div className="hl-title">
          <strong>“{group.display}”</strong> {kind === 'phrase' ? 'phrase ' : ''}used {n} {n === 1 ? 'time' : 'times'}
          <span className="muted"> in {scope.id === 'all' ? 'the whole blog' : `“${scope.title}”`}</span>
        </div>
        <div className="hl-nav">
          <button type="button" className="btn ghost sm" onClick={() => step(-1)} aria-label="Previous">
            ‹
          </button>
          <span className="hl-pos">
            {active + 1} of {n}
          </span>
          <button type="button" className="btn ghost sm" onClick={() => step(1)} aria-label="Next">
            ›
          </button>
          <button type="button" className="btn sm" onClick={onClose}>
            Back to editing
          </button>
        </div>
      </div>
      {(options.length > 0 || closeCount > 0 || (find && find.elsewhere.length > 0) || (group.forms.length > 1 && splittable.length > 0)) && (
        <div className="hl-extra">
          {group.forms.length > 1 && splittable.length > 0 && (
            <p>
              <span className="muted">Counted together: </span>
              {group.forms.map((f, i) => (
                <span key={f.form}>
                  {i > 0 && ' · '}
                  {f.form} ×{f.count}
                  {f.form !== group.key && (
                    <button type="button" className="split" title={`Count “${f.form}” on its own from now on`} onClick={() => onSeparate!(f.form)}>
                      count separately
                    </button>
                  )}
                </span>
              ))}
            </p>
          )}
          {find && find.elsewhere.length > 0 && (
            <p>
              <span className="muted">
                Find (Ctrl+F) for “{find.needle}” shows {find.total} here: {find.counted} counted above, and {find.total - find.counted} inside other
                words:{' '}
              </span>
              {find.elsewhere.slice(0, 8).map((e, i) => (
                <span key={e.word}>
                  {i > 0 && ' · '}
                  {e.word} ×{e.count}
                </span>
              ))}
              {find.elsewhere.length > 8 && ' …'}
            </p>
          )}
          {closeCount > 0 && (
            <p>
              <span className="close-key" /> {group.close} {group.close === 1 ? 'repeat comes' : 'repeats come'} within a few words of the
              previous use (underlined in red).
            </p>
          )}
          {options.map((o) => (
            <p key={o.as}>
              <span className="muted">Possible alternatives ({o.as}): </span>
              {o.words.map((w, i) => (
                <span key={w}>
                  {i > 0 && ' · '}
                  <strong>{w}</strong>
                  {usage.get(w) ? <span className="muted"> (already used ×{usage.get(w)})</span> : null}
                </span>
              ))}
              <span className="muted"> — check that it fits your sentence.</span>
            </p>
          ))}
        </div>
      )}
      <div className="doc-scroll">
        <div className="doc readonly">
          {doc.blocks.map((b, i) => {
            if (b.kind === 'heading') {
              const H = `h${b.level}` as 'h1';
              return <H key={i}>{render(b.start, b.end)}</H>;
            }
            if (b.kind === 'paragraph') return <p key={i}>{render(b.start, b.end)}</p>;
            if (b.kind === 'list') {
              const L = b.ordered ? 'ol' : 'ul';
              return (
                <L key={i}>
                  {b.items.map((it, j) => (
                    <li key={j} style={it.depth ? { marginLeft: `${it.depth * 1.5}em` } : undefined}>
                      {render(it.start, it.end)}
                    </li>
                  ))}
                </L>
              );
            }
            return (
              <table key={i}>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, k) => (
                        <Fragment key={k}>{c.header ? <th>{render(c.start, c.end)}</th> : <td>{render(c.start, c.end)}</td>}</Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </div>
      </div>
    </div>
  );
}
