'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Group } from '@/lib/analyze';
import type { DocModel } from '@/lib/document';
import { deletionEdits, sentenceAround, type Edit } from '@/lib/editing';
import { inflect, matchWritten, readingsOf } from '@/lib/inflect';
import { isDroppable, type Morphology } from '@/lib/morphology';
import { loadThesaurus, type Thesaurus } from '@/lib/thesaurus';

interface Props {
  doc: DocModel;
  group: Group;
  kind: 'word' | 'phrase';
  /** Index of the use being fixed. */
  index: number;
  morphology: Morphology | null;
  /** How many times each word is already used in the blog. */
  usage: Map<string, number>;
  /** True while the results are catching up with the last change. */
  busy: boolean;
  onApply: (edits: Edit[], message: string) => boolean;
  onKeep: () => void;
}

const POS: Record<string, 'n' | 'v' | 'a'> = { noun: 'n', verb: 'v', adjective: 'a' };

interface Option {
  text: string;
  /** The synonym's base word, to show how often it is already used. */
  base: string;
}

/** Ready-made replacements for one use, in the same form as the written word. */
function replacements(t: Thesaurus, m: Morphology | null, group: Group, written: string): Option[] {
  const words = [group.key, ...group.forms.map((f) => f.form)];
  const lookup = (pos: 'n' | 'v' | 'a' | 'r') => {
    for (const w of words) {
      const entry = t[pos]?.[w];
      if (entry) return entry.split(',').filter((s) => !words.includes(s));
    }
    return [];
  };
  const out: Option[] = [];
  const add = (base: string, text: string) => {
    const final = matchWritten(written, text);
    if (final.toLowerCase() !== written.toLowerCase() && !out.some((o) => o.text === final)) out.push({ text: final, base });
  };
  const readings = readingsOf(m, written, group.key);
  if (readings.length) {
    for (const r of readings) for (const syn of lookup(POS[r.kind])) for (const f of inflect(m, syn, r.form)) add(syn, f);
  } else if (written.toLowerCase().replace(/['\u2019]s$/, '') === group.key) {
    // No dictionary reading (exact-spelling mode): offer every kind of synonym as written.
    for (const pos of ['n', 'v', 'a', 'r'] as const) for (const syn of lookup(pos)) add(syn, syn);
  }
  if (!readings.length || readings.some((r) => r.form === 'base')) for (const syn of lookup('r')) add(syn, syn);
  return out;
}

export default function FixPanel({ doc, group, kind, index, morphology, usage, busy, onApply, onKeep }: Props) {
  const [thesaurus, setThesaurus] = useState<Thesaurus | null>(null);
  const [own, setOwn] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadThesaurus()
      .then(setThesaurus)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    setOwn('');
    setError(null);
  }, [group.key, index]);

  const occ = group.occurrences[index];
  const written = occ ? doc.text.slice(occ.start, occ.end) : '';
  const options = useMemo(
    () => (thesaurus && kind === 'word' && occ && !group.link ? replacements(thesaurus, morphology, group, written) : []),
    [thesaurus, morphology, group, written, kind, occ],
  );
  if (!occ) return null;

  const context = sentenceAround(doc.text, occ.start, occ.end);
  // Deleting a noun or verb breaks the sentence ("The battery is" -> "The is").
  const plain = written.toLowerCase().replace(/['\u2019]s$/, '');
  const droppable = kind === 'word' && morphology !== null && isDroppable(morphology, plain);
  const apply = (edits: Edit[], message: string) => {
    setError(null);
    if (!onApply(edits, message)) setError('The text changed before this could be applied. Please try again.');
  };
  const replace = (text: string) => apply([{ start: occ.start, end: occ.end, text }], `Changed “${written}” to “${text}”.`);

  return (
    <div className="fix">
      <p className="fix-context">
        <span className="muted">Use {index + 1}: </span>
        {context.before}
        <mark className="active">{context.word}</mark>
        {context.after}
      </p>
      <div className="fix-actions">
        {options.length > 0 && <span className="muted">Replace with:</span>}
        {options.slice(0, 8).map((o) => (
          <button key={o.text} type="button" className="chip fix-chip" disabled={busy} onClick={() => replace(o.text)}>
            {o.text}
            {usage.get(o.base) ? <span className="muted"> · used ×{usage.get(o.base)}</span> : null}
          </button>
        ))}
        {droppable && (
          <button
            type="button"
            className="chip fix-chip danger"
            disabled={busy}
            onClick={() => apply(deletionEdits(doc, occ.start, occ.end), `Deleted “${written}”.`)}
            title="Remove this word (and a comma right after it)"
          >
            Delete “{written}”
          </button>
        )}
        <button type="button" className="chip fix-chip" disabled={busy} onClick={onKeep} title="Leave this one and go to the next use">
          Keep, next →
        </button>
      </div>
      <form
        className="fix-own"
        onSubmit={(e) => {
          e.preventDefault();
          if (own.trim()) replace(own.trim());
        }}
      >
        <input type="text" value={own} placeholder={`Type your own words instead of “${written}”`} onChange={(e) => setOwn(e.target.value)} />
        <button type="submit" className="btn sm" disabled={busy || !own.trim()}>
          Replace
        </button>
      </form>
      {options.length === 0 && thesaurus && kind === 'word' && (
        <p className="muted small">
          The dictionary has no safe synonym for “{written}”. Type your own words above (for example “it” or a more specific word), or keep
          it and change another use.
        </p>
      )}
      {error && <p className="fix-error">{error}</p>}
    </div>
  );
}
