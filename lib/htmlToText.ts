/**
 * Converts HTML from the clipboard (Google Docs, WordPress, Word, web pages)
 * into plain text where real headings become "# ", "## " ... lines. This keeps
 * the exact heading structure of the original document, so sections are split
 * precisely instead of being guessed.
 */

const SKIP = new Set(['script', 'style', 'head', 'meta', 'title', 'noscript', 'template', 'svg']);
const PARAGRAPH = new Set(['p', 'blockquote', 'pre', 'ul', 'ol', 'table', 'figure', 'hr']);
const BLOCK = new Set([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'tr', 'thead', 'tbody', 'tfoot', 'figcaption', 'dl', 'dt', 'dd', 'caption',
]);

export function hasHeadings(html: string): boolean {
  return /<h[1-6][\s>]/i.test(html);
}

export function htmlToText(html: string, parser: DOMParser = new DOMParser()): string {
  const doc = parser.parseFromString(html, 'text/html');
  const out: string[] = [];
  let line = '';
  let listDepth = 0;

  const flush = () => {
    const t = line.replace(/[ \t\u00A0]+/g, ' ').trim();
    if (t) out.push(t);
    line = '';
  };
  const blankLine = () => {
    if (out.length && out[out.length - 1] !== '') out.push('');
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      line += (node.nodeValue ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag)) return;

    const h = /^h([1-6])$/.exec(tag);
    if (h) {
      flush();
      blankLine();
      const title = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (title) out.push(`${'#'.repeat(Number(h[1]))} ${title}`);
      blankLine();
      return;
    }
    if (tag === 'br') return flush();
    if (tag === 'li') {
      flush();
      line = '- ';
      listDepth++;
      el.childNodes.forEach(walk);
      listDepth--;
      if (line.trim() === '-') line = '';
      return flush();
    }
    // Inside a list item, paragraphs are part of the item's line (Google Docs
    // wraps every item in <p>); nested lists start new lines.
    if (listDepth > 0 && (PARAGRAPH.has(tag) || BLOCK.has(tag))) {
      if (tag === 'ul' || tag === 'ol') flush();
      el.childNodes.forEach(walk);
      return;
    }
    if (tag === 'td' || tag === 'th') {
      line += ' ';
      el.childNodes.forEach(walk);
      line += ' ';
      return;
    }
    if (PARAGRAPH.has(tag)) {
      flush();
      blankLine();
      el.childNodes.forEach(walk);
      flush();
      blankLine();
      return;
    }
    if (BLOCK.has(tag)) {
      flush();
      el.childNodes.forEach(walk);
      flush();
      return;
    }
    el.childNodes.forEach(walk);
  };

  doc.body.childNodes.forEach(walk);
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
