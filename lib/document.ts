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

export interface DocModel {
  text: string;
  blocks: Block[];
  headings: HeadingLine[];
  tableCount: number;
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'td', 'th', 'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'figure', 'figcaption', 'hr', 'dl', 'dt', 'dd', 'caption',
]);
const SKIP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head', 'meta', 'title']);

const tagOf = (n: Node) => (n.nodeType === 1 ? (n as Element).tagName.toLowerCase() : '');
const isBlock = (n: Node) => BLOCK_TAGS.has(tagOf(n));

/** Text of inline content; <br> becomes a line break, source whitespace collapses. */
function inlineText(node: Node, pre = false): string {
  if (node.nodeType === 3) {
    const v = node.nodeValue ?? '';
    return pre ? v : v.replace(/[ \t\n\r\f]+/g, ' ');
  }
  if (node.nodeType !== 1) return '';
  const tag = tagOf(node);
  if (SKIP_TAGS.has(tag)) return '';
  if (tag === 'br') return '\n';
  let out = '';
  node.childNodes.forEach((c) => {
    const t = inlineText(c, pre || tag === 'pre');
    // Blocks nested inside inline content still start on a new line.
    out += isBlock(c) && out && !out.endsWith('\n') ? '\n' + t : t;
  });
  return out;
}

/** Trims each line and drops empty ones (they hold no words). */
const tidy = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/^[ \t\u00A0]+|[ \t\u00A0]+$/g, ''))
    .filter(Boolean)
    .join('\n');

export function modelFromElement(root: Element): DocModel {
  let text = '';
  const blocks: Block[] = [];
  const headings: HeadingLine[] = [];
  let tableCount = 0;

  const line = (s: string): Range => {
    if (text) text += '\n';
    const start = text.length;
    text += s;
    return { start, end: text.length };
  };

  const paragraph = (raw: string) => {
    const t = tidy(raw);
    if (t) blocks.push({ kind: 'paragraph', ...line(t) });
  };

  const list = (el: Element, depth: number, items: (Range & { depth: number })[]) => {
    el.childNodes.forEach((li) => {
      if (tagOf(li) !== 'li') {
        if (isBlock(li) && (tagOf(li) === 'ul' || tagOf(li) === 'ol')) list(li as Element, depth + 1, items);
        else {
          const t = tidy(inlineText(li));
          if (t) items.push({ ...line(t), depth });
        }
        return;
      }
      let own = '';
      const nested: Element[] = [];
      li.childNodes.forEach((c) => {
        if (tagOf(c) === 'ul' || tagOf(c) === 'ol') nested.push(c as Element);
        else own += inlineText(c);
      });
      const t = tidy(own);
      if (t) items.push({ ...line(t), depth });
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
        cells.push({ ...line(tidy(inlineText(c)).replace(/\n+/g, ' ')), header: tag === 'th' });
      });
      if (cells.length) rows.push(cells);
    });
    if (rows.length) {
      blocks.push({ kind: 'table', rows });
      tableCount++;
    }
  };

  const walk = (parent: Node) => {
    let inline = '';
    const flush = () => {
      paragraph(inline);
      inline = '';
    };
    parent.childNodes.forEach((n) => {
      if (!isBlock(n)) {
        inline += inlineText(n);
        return;
      }
      flush();
      const el = n as Element;
      const tag = tagOf(n);
      const h = /^h([1-6])$/.exec(tag);
      if (h) {
        const title = tidy(inlineText(el)).replace(/\s*\n\s*/g, ' ');
        if (!title) return;
        const r = line(title);
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
  return { text, blocks, headings, tableCount };
}

export function modelFromHtml(html: string, parser: DOMParser = new DOMParser()): DocModel {
  return modelFromElement(parser.parseFromString(`<body>${html}</body>`, 'text/html').body);
}
