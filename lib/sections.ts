/**
 * Splits a blog into sections by its headings.
 *
 * Detection modes:
 *  - "markdown": only lines starting with # .. ###### are headings. Exact.
 *    Pasting from Google Docs / WordPress / Word converts real headings into
 *    this form automatically (see htmlToText.ts), so this is the reliable path.
 *  - "auto": markdown headings if the text has any; otherwise a conservative
 *    plain-text rule (a short line without end punctuation that sits between
 *    paragraphs).
 *  - "off": the whole text is one section.
 */

export type HeadingMode = 'auto' | 'markdown' | 'off';

export interface Section {
  id: string;
  title: string;
  /** 1-6 for headings, 0 for text before the first heading. */
  level: number;
  /** Offsets of the heading line (equal when there is no heading). */
  headingStart: number;
  headingEnd: number;
  /** Offsets of the text under the heading, up to the next heading. */
  bodyStart: number;
  bodyEnd: number;
}

interface Line {
  start: number;
  end: number;
  text: string;
}

interface Heading {
  line: number;
  level: number;
  title: string;
}

const MD_HEADING_RE = /^\s{0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      let end = i;
      if (end > start && text[end - 1] === '\r') end--;
      lines.push({ start, end, text: text.slice(start, end) });
      start = i + 1;
    }
  }
  return lines;
}

function findMarkdownHeadings(lines: Line[]): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  lines.forEach((l, i) => {
    if (/^\s{0,3}(```|~~~)/.test(l.text)) inFence = !inFence;
    if (inFence) return;
    const m = MD_HEADING_RE.exec(l.text);
    if (m) headings.push({ line: i, level: m[1].length, title: m[2].trim() });
  });
  return headings;
}

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/** A line that is clearly running text rather than a title or list item. */
function looksLikeParagraph(s: string): boolean {
  const t = s.trim();
  return /[.!?:;"\u201D')\]]$/.test(t) || wordCount(t) >= 15;
}

function looksLikeHeadingLine(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 100) return false;
  const words = wordCount(t);
  if (words < 1 || words > 14) return false;
  if (/[.,;:!]$/.test(t)) return false;
  if (/^([-*\u2022\u2013]|\d+[.)])\s/.test(t) && !/^\d+[.)]\s+\p{Lu}/u.test(t)) return false;
  return /\p{L}/u.test(t);
}

function findPlainHeadings(lines: Line[]): Heading[] {
  const headings: Heading[] = [];
  const nonEmpty = lines
    .map((l, i) => ({ i, text: l.text }))
    .filter((l) => l.text.trim() !== '');
  nonEmpty.forEach((cur, k) => {
    if (!looksLikeHeadingLine(cur.text)) return;
    const next = nonEmpty[k + 1];
    if (!next || !looksLikeParagraph(next.text)) return;
    const prev = nonEmpty[k - 1];
    // A short un-punctuated line after another one is a list, not a heading.
    if (prev && !looksLikeParagraph(prev.text)) return;
    if (prev && /:\s*$/.test(prev.text)) return;
    headings.push({ line: cur.i, level: 2, title: cur.text.trim() });
  });
  return headings;
}

export function splitSections(text: string, mode: HeadingMode = 'auto'): Section[] {
  const lines = splitLines(text);
  let headings: Heading[] = [];
  if (mode !== 'off') {
    headings = findMarkdownHeadings(lines);
    if (mode === 'auto' && headings.length === 0) headings = findPlainHeadings(lines);
  }

  const sections: Section[] = [];
  const firstHeadingStart = headings.length ? lines[headings[0].line].start : text.length;
  if (headings.length === 0 || text.slice(0, firstHeadingStart).trim() !== '') {
    sections.push({
      id: 's0',
      title: headings.length ? 'Introduction (before first heading)' : 'Full text',
      level: 0,
      headingStart: 0,
      headingEnd: 0,
      bodyStart: 0,
      bodyEnd: firstHeadingStart,
    });
  }
  headings.forEach((h, k) => {
    const line = lines[h.line];
    const next = headings[k + 1];
    sections.push({
      id: `s${k + 1}`,
      title: h.title,
      level: h.level,
      headingStart: line.start,
      headingEnd: line.end,
      bodyStart: line.end,
      bodyEnd: next ? lines[next.line].start : text.length,
    });
  });
  return sections;
}
