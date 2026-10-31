/**
 * Cleans HTML pasted from Google Docs, Word, WordPress or web pages. Keeps
 * the document structure (headings H1-H6, paragraphs, lists, tables, bold,
 * italic) and drops everything else (styles, scripts, classes, images).
 * Text is never dropped, only the formatting around it.
 */

const KEEP = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
]);
const DROP = new Set([
  'script', 'style', 'template', 'noscript', 'svg', 'head', 'meta', 'title', 'link',
  'iframe', 'object', 'embed', 'img', 'video', 'audio', 'canvas', 'input', 'button', 'select', 'textarea',
]);
// Containers that become a paragraph when they hold only text, or disappear when they hold blocks.
const CONTAINERS = new Set([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption',
  'dl', 'dt', 'dd', 'address', 'center', 'form', 'fieldset', 'details', 'summary',
]);
const BLOCKS = new Set([...KEEP, ...CONTAINERS, 'hr']);

const isBlockNode = (n: Node) => n.nodeType === 1 && BLOCKS.has((n as Element).tagName.toLowerCase());

function styleOf(el: Element): string {
  return (el.getAttribute('style') ?? '').toLowerCase();
}

function isBold(el: Element, tag: string): boolean {
  const st = styleOf(el);
  const weight = /font-weight\s*:\s*(\w+)/.exec(st)?.[1];
  if (tag === 'b' || tag === 'strong') return !(weight === 'normal' || (weight !== undefined && Number(weight) < 600));
  return weight === 'bold' || weight === 'bolder' || (weight !== undefined && Number(weight) >= 600);
}

function isItalic(el: Element, tag: string): boolean {
  return tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/.test(styleOf(el));
}

function clean(node: Node, doc: Document): Node[] {
  if (node.nodeType === 3) return [doc.createTextNode(node.nodeValue ?? '')];
  if (node.nodeType !== 1) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return [];
  if (tag === 'br') return [doc.createElement('br')];
  if (tag === 'hr') return [];

  const children = [...el.childNodes].flatMap((c) => clean(c, doc));
  const wrap = (name: string, kids: Node[]) => {
    const out = doc.createElement(name);
    kids.forEach((k) => out.appendChild(k));
    return out;
  };

  if (KEEP.has(tag)) {
    const out = wrap(tag, children);
    if (tag === 'td' || tag === 'th') {
      for (const a of ['colspan', 'rowspan']) {
        const v = el.getAttribute(a);
        if (v && /^\d+$/.test(v)) out.setAttribute(a, v);
      }
    }
    if (tag === 'ol' && el.getAttribute('start')) out.setAttribute('start', el.getAttribute('start')!);
    return [out];
  }

  const hasBlocks = children.some(isBlockNode);
  if (CONTAINERS.has(tag)) return hasBlocks ? children : children.length ? [wrap('p', children)] : [];

  // Inline elements: keep bold and italic; unwrap anything that holds blocks
  // (Google Docs wraps the whole document in <b style="font-weight:normal">).
  if (hasBlocks) return children;
  let kids = children;
  if (isItalic(el, tag)) kids = [wrap('em', kids)];
  if (isBold(el, tag)) kids = [wrap('strong', kids)];
  return kids;
}

export function sanitizeHtml(html: string, parser: DOMParser = new DOMParser()): string {
  const src = parser.parseFromString(html, 'text/html');
  const doc = parser.parseFromString('<body></body>', 'text/html');
  const nodes = [...src.body.childNodes].flatMap((c) => clean(c, doc));
  nodes.forEach((n) => doc.body.appendChild(n));
  return doc.body.innerHTML;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export { escapeHtml };
