/**
 * Reads the rich-text editor (or any HTML) into a document model: the plain
 * text that is counted, plus the exact position of every heading, paragraph,
 * list item and table cell in that text. Each block is its own line, so
 * repeated phrases never run from one paragraph, item or cell into the next.
 */

import type { HeadingLine } from './sections';

export interface Range {
  start: number;
  end: number;
}

export type Block =
  | ({ kind: 'heading'; level: number } & Range)
  | ({ kind: 'paragraph' } & Range)
  | { kind: 'list'; ordered: boolean; items: (Range & { depth: number })[] }
  | { kind: 'table'; rows: (Range & { header: boolean })[][] };

/** Where a character of the counted text sits in the document. */
export interface Source {
  node: Text;
  offset: number;
}

export interface DocModel {
  text: string;
  blocks: Block[];
  headings: HeadingLine[];
  tableCount: number;
  /**
   * For each character of `text`, the document text node and offset it was
   * read from (null for line breaks the reader added). Lets a fix replace
   * exactly the word that was counted, inside its formatting.
   */
  sources?: (Source | null)[];
}

/** Text with the source of every character. */
interface Traced {
  s: string;
  src: (Source | null)[];
}

const EMPTY: Traced = { s: '', src: [] };
const traced = (s: string, src: Source | null = null): Traced => ({ s, src: Array.from({ length: s.length }, () => src) });
const join = (...parts: Traced[]): Traced => ({ s: parts.map((p) => p.s).join(''), src: parts.flatMap((p) => p.src) });
const slice = (t: Traced, a: number, b = t.s.length): Traced => ({ s: t.s.slice(a, b), src: t.src.slice(a, b) });
/** Replaces single characters, keeping each one's source. */
const mapChars = (t: Traced, from: RegExp, to: string): Traced => ({ s: t.s.replace(from, to), src: t.src });

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'td', 'th', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'figure', 'figcaption', 'hr', 'dl', 'dt', 'dd', 'caption',
]);
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head', 'meta', 'title']);

const tagOf = (n: Node) => (n.nodeType === 1 ? (n as Element).tagName.toLowerCase() : '');
const isBlock = (n: Node) => BLOCK_TAGS.has(tagOf(n));

/** Text of inline content; <br> becomes a line break, source whitespace collapses. */
function inlineText(node: Node, pre = false): Traced {
  if (node.nodeType === 3) {
    const v = node.nodeValue ?? '';
    const text = node as Text;
    let s = '';
    const src: Source[] = [];
    for (let i = 0; i < v.length; i++) {
      const space = !pre && /[ \t\n\r\f]/.test(v[i]);
      if (space && s.endsWith(' ') && src.length && /[ \t\n\r\f]/.test(v[src[src.length - 1].offset])) continue;
      s += space ? ' ' : v[i];
      src.push({ node: text, offset: i });
    }
    return { s, src };
  }
  if (node.nodeType !== 1) return EMPTY;
  const tag = tagOf(node);
  if (SKIP_TAGS.has(tag)) return EMPTY;
  if (tag === 'br') return traced('\n');
  let out = EMPTY;
  node.childNodes.forEach((c) => {
    const t = inlineText(c, pre || tag === 'pre');
    // Blocks nested inside inline content still start on a new line.
    out = isBlock(c) && out.s && !out.s.endsWith('\n') ? join(out, traced('\n'), t) : join(out, t);
  });
  return out;
}

/** Trims each line and drops empty ones (they hold no words). */
function tidy(t: Traced): Traced {
  const lines: Traced[] = [];
  let at = 0;
  for (const part of t.s.split('\n')) {
    let line = slice(t, at, at + part.length);
    at += part.length + 1;
    const lead = /^[ \t\u00A0]*/.exec(line.s)![0].length;
    const trail = /[ \t\u00A0]*$/.exec(line.s)![0].length;
    line = slice(line, lead, line.s.length - trail);
    if (line.s) lines.push(line);
  }
  return lines.reduce((acc, l, i) => (i ? join(acc, traced('\n'), l) : l), EMPTY);
}

export function modelFromElement(root: Element): DocModel {
  let text = '';
  const sources: (Source | null)[] = [];
  const blocks: Block[] = [];
  const headings: HeadingLine[] = [];
  let tableCount = 0;

  const line = (t: Traced): Range => {
    if (text) {
      text += '\n';
      sources.push(null);
    }
    const start = text.length;
    text += t.s;
    sources.push(...t.src);
    return { start, end: text.length };
  };

  const paragraph = (raw: Traced) => {
    const t = tidy(raw);
    if (t.s) blocks.push({ kind: 'paragraph', ...line(t) });
  };

  const list = (el: Element, depth: number, items: (Range & { depth: number })[]) => {
    el.childNodes.forEach((li) => {
      if (tagOf(li) !== 'li') {
        if (isBlock(li) && (tagOf(li) === 'ul' || tagOf(li) === 'ol')) list(li as Element, depth + 1, items);
        else {
          const t = tidy(inlineText(li));
          if (t.s) items.push({ ...line(t), depth });
        }
        return;
      }
      let own = EMPTY;
      const nested: Element[] = [];
      li.childNodes.forEach((c) => {
        if (tagOf(c) === 'ul' || tagOf(c) === 'ol') nested.push(c as Element);
        else own = join(own, inlineText(c));
      });
      const t = tidy(own);
      if (t.s) items.push({ ...line(t), depth });
      nested.forEach((n) => list(n, depth + 1, items));
    });
  };

  const table = (el: Element) => {
    const rows: (Range & { header: boolean })[][] = [];
    el.querySelectorAll('tr').forEach((tr) => {
      if (tr.closest('table') !== el) return; // rows of a nested table are read with that table
      const cells: (Range & { header: boolean })[] = [];
      tr.childNodes.forEach((c) => {
        const tag = tagOf(c);
        if (tag !== 'td' && tag !== 'th') return;
        cells.push({ ...line(mapChars(tidy(inlineText(c)), /\n/g, ' ')), header: tag === 'th' });
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length) {
      blocks.push({ kind: 'table', rows });
      tableCount++;
    }
  };

  const walk = (parent: Node) => {
    let inline = EMPTY;
    const flush = () => {
      paragraph(inline);
      inline = EMPTY;
    };
    parent.childNodes.forEach((n) => {
      if (!isBlock(n)) {
        inline = join(inline, inlineText(n));
        return;
      }
      flush();
      const el = n as Element;
      const tag = tagOf(n);
      const h = /^h([1-6])$/.exec(tag);
      if (h) {
        const traced = mapChars(tidy(inlineText(el)), /\n/g, ' ');
        const title = traced.s;
        if (!title) return;
        const r = line(traced);
        const level = Number(h[1]);
        blocks.push({ kind: 'heading', level, ...r });
        headings.push({ title, level, ...r });
      } else if (tag === 'ul' || tag === 'ol') {
        const items: (Range & { depth: number })[] = [];
        list(el, 0, items);
        if (items.length) blocks.push({ kind: 'list', ordered: tag === 'ol', items });
      } else if (tag === 'table') {
        table(el);
      } else if (tag === 'hr') {
        // nothing to count
      } else if (tag === 'pre') {
        paragraph(inlineText(el, true));
      } else if ([...el.childNodes].some(isBlock)) {
        walk(el);
      } else {
        paragraph(inlineText(el));
      }
    });
    flush();
  };

  walk(root);
  return { text, blocks, headings, tableCount, sources };
}

export function modelFromHtml(html: string, parser: DOMParser = new DOMParser()): DocModel {
  return modelFromElement(parser.parseFromString(`<body>${html}</body>`, 'text/html').body);
}
