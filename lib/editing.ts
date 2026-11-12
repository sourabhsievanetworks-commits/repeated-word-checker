/**
 * Applies fixes (replace or delete a word) directly to the document, inside
 * its formatting: a bold word stays bold, a word in a table stays in its cell.
 *
 * An edit is applied only if the document still says exactly what was counted
 * at that spot. If anything changed in between, nothing is touched.
 */

import type { DocModel, Source } from './document';

export interface Edit {
  /** Range in the counted text (DocModel.text). */
  start: number;
  end: number;
  text: string;
}

const SPACE = /[\s\u00A0]/;

/** Does the document still hold what the model read at [start, end)? */
function sourcesFor(model: DocModel, root: Node, start: number, end: number): Source[] | null {
  const src = model.sources;
  if (!src || start < 0 || end > model.text.length || start >= end) return null;
  const out: Source[] = [];
  for (let i = start; i < end; i++) {
    const s = src[i];
    if (!s || !root.contains(s.node)) return null;
    const actual = s.node.data[s.offset];
    const expected = model.text[i];
    if (actual === undefined || (SPACE.test(expected) ? !SPACE.test(actual) : actual !== expected)) return null;
    out.push(s);
  }
  return out;
}

/**
 * Applies the edits to the document under `root`, last first so earlier
 * offsets stay valid. Returns false (and changes nothing) if any edit no
 * longer matches the document.
 */
export function applyEdits(root: Node, model: DocModel, edits: Edit[]): boolean {
  const resolved = edits.map((e) => ({ e, src: sourcesFor(model, root, e.start, e.end) }));
  if (resolved.some((r) => r.src === null)) return false;

  resolved.sort((a, b) => b.e.start - a.e.start);
  for (const { e, src } of resolved) {
    // Group the characters by text node: a word can span "track<b>er</b>".
    const runs: { node: Text; from: number; to: number }[] = [];
    for (const s of src!) {
      const last = runs[runs.length - 1];
      if (last && last.node === s.node) last.to = s.offset + 1;
      else runs.push({ node: s.node, from: s.offset, to: s.offset + 1 });
    }
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      if (i === 0) r.node.replaceData(r.from, r.to - r.from, e.text);
      else r.node.deleteData(r.from, r.to - r.from);
    }
  }
  return true;
}

const START_OF_SENTENCE = /(^|[\n.!?:]\s*["'\u201C\u2018(]?)$/;

/**
 * Edits that delete a word with one neighbouring space, and a comma, semicolon
 * or colon right after it ("very, very good" -> "very good"). If the word
 * started a sentence, the next word gets its capital letter.
 */
export function deletionEdits(model: DocModel, start: number, end: number): Edit[] {
  const text = model.text;
  let a = start;
  let b = end;
  if (/[,;:]/.test(text[b] ?? '') && text[b + 1] === ' ' && (a === 0 || text[a - 1] === ' ')) b += 2;
  else if (text[b] === ' ') b++;
  else if (text[a - 1] === ' ') a--;
  const edits: Edit[] = [{ start: a, end: b, text: '' }];
  const wordStart = text[start];
  if (wordStart && wordStart !== wordStart.toLowerCase() && START_OF_SENTENCE.test(text.slice(0, start))) {
    const next = text.slice(b).search(/\p{L}/u);
    if (next >= 0 && !/[\n.!?]/.test(text.slice(b, b + next))) {
      const at = b + next;
      edits.push({ start: at, end: at + 1, text: text[at].toUpperCase() });
    }
  }
  return edits;
}

/** The sentence around [start, end), for showing a use in context. */
export function sentenceAround(text: string, start: number, end: number, max = 160): { before: string; word: string; after: string } {
  let a = start;
  while (a > 0 && !/[\n.!?]/.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && !/[\n.!?]/.test(text[b])) b++;
  if (b < text.length && text[b] !== '\n') b++;
  let before = text.slice(a, start).trimStart();
  let after = text.slice(end, b);
  const room = Math.max(20, Math.floor((max - (end - start)) / 2));
  if (before.length > room) before = '\u2026' + before.slice(before.length - room).replace(/^\S*\s/, '');
  if (after.length > room) after = after.slice(0, room).replace(/\s\S*$/, '') + '\u2026';
  return { before, word: text.slice(start, end), after };
}
