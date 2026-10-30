'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, ScopeResult } from '@/lib/analyze';

interface Props {
  text: string;
  group: Group;
  scope: ScopeResult;
  kind: 'word' | 'phrase';
  onClose: () => void;
}

interface Piece {
  start: number;
  end: number;
  /** Occurrence indexes inside this mark; empty for plain text. */
  occ: number[];
}

/** Splits the text into plain and highlighted pieces. Overlapping phrase matches merge into one mark. */
function piecesFor(text: string, group: Group): Piece[] {
  const marks: Piece[] = [];
  group.occurrences.forEach((o, i) => {
    const last = marks[marks.length - 1];
    if (last && o.start < last.end) {
      last.end = Math.max(last.end, o.end);
      last.occ.push(i);
    } else marks.push({ start: o.start, end: o.end, occ: [i] });
  });
  const pieces: Piece[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) pieces.push({ start: at, end: m.start, occ: [] });
    pieces.push(m);
    at = m.end;
  }
  if (at < text.length) pieces.push({ start: at, end: text.length, occ: [] });
  return pieces;
}

export default function HighlightView({ text, group, scope, kind, onClose }: Props) {
  const [active, setActive] = useState(0);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const pieces = useMemo(() => piecesFor(text, group), [text, group]);
  const n = group.occurrences.length;

  useEffect(() => setActive(0), [group.key, scope.id]);

  useEffect(() => {
    markRefs.current.get(active)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, pieces]);

  const step = (d: number) => setActive((a) => (a + d + n) % n);

  // Text outside the selected section is dimmed.
  const renderPlain = (p: Piece) => {
    const parts: React.ReactNode[] = [];
    const cuts = [p.start, Math.min(Math.max(scope.start, p.start), p.end), Math.min(Math.max(scope.end, p.start), p.end), p.end];
    for (let i = 0; i < 3; i++) {
      if (cuts[i + 1] <= cuts[i]) continue;
      const inScope = i === 1;
      parts.push(
        <span key={i} className={inScope ? undefined : 'dim'}>
          {text.slice(cuts[i], cuts[i + 1])}
        </span>,
      );
    }
    return parts;
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
      <div className="hl-text">
        {pieces.map((p) =>
          p.occ.length ? (
            <mark
              key={p.start}
              ref={(el) => {
                for (const i of p.occ) {
                  if (el) markRefs.current.set(i, el);
                  else markRefs.current.delete(i);
                }
              }}
              className={p.occ.includes(active) ? 'active' : undefined}
              onClick={() => setActive(p.occ[0])}
            >
              {text.slice(p.start, p.end)}
              <sup>{p.occ[0] + 1}</sup>
            </mark>
          ) : (
            <span key={p.start}>{renderPlain(p)}</span>
          ),
        )}
      </div>
    </div>
  );
}
