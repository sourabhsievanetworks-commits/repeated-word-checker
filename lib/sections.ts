/**
 * Splits a blog into sections the way a blog is structured:
 *  - Introduction: the H1 title and everything before the first H2.
 *  - One section per H2. H3-H6 sub-headings stay inside their H2 section.
 * If a text has no H2 but has H3s, H3 is used as the section level instead.
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

export interface HeadingLine {
  title: string;
  level: number;
  /** Offsets of the whole heading line. */
  start: number;
  end: number;
}

export interface Section {
  id: string;
  title: string;
  /** Heading level that starts the section (2 for H2); 0 for the introduction. */
  level: number;
  /** The H1 title, for the introduction section. */
  h1?: string;
  /** Character range of the section, its own heading included. */
  start: number;
  end: number;
  /** Every heading line inside the section (its own heading and any sub-headings). */
  headings: HeadingLine[];
  /** H3-H6 headings counted inside this section. */
  subheadings: HeadingLine[];
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

const BULLET_RE = /^\s*[-*\u2022\u2013\u25AA\u25CF]\s/;

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
    // A bulleted item before it is fine: the list has ended.
    if (prev && !looksLikeParagraph(prev.text) && !BULLET_RE.test(prev.text)) return;
    if (prev && /:\s*$/.test(prev.text)) return;
    headings.push({ line: cur.i, level: 2, title: cur.text.trim() });
  });
  return headings;
}

/** Finds heading lines in plain text (markdown "#" lines, or the plain-text rule). */
export function findHeadingLines(text: string, mode: HeadingMode = 'auto'): HeadingLine[] {
  if (mode === 'off') return [];
  const lines = splitLines(text);
  let found = findMarkdownHeadings(lines);
  if (mode === 'auto' && found.length === 0) {
    found = findPlainHeadings(lines);
    // In plain text the first line is the post title (H1) when it looks like a heading.
    const firstLine = lines.findIndex((l) => l.text.trim() !== '');
    if (found[0]?.line === firstLine) found[0] = { ...found[0], level: 1 };
  }
  return found.map((h) => ({ title: h.title, level: h.level, start: lines[h.line].start, end: lines[h.line].end }));
}

/**
 * Builds sections from known headings: Introduction (H1 + text before the
 * first H2), then one section per H2 with its H3-H6 inside it.
 */
export function sectionsFromHeadings(text: string, headings: HeadingLine[]): Section[] {
  if (headings.length === 0) {
    return [{ id: 's0', title: 'Full text', level: 0, start: 0, end: text.length, headings: [], subheadings: [] }];
  }

  // Section level: H2 normally; the highest sub-level used when there is no H2.
  const subLevels = headings.filter((h) => h.level >= 2).map((h) => h.level);
  const sectionLevel = subLevels.length ? Math.min(...subLevels) : 1;
  const breaks = headings.filter((h) => h.level <= sectionLevel);

  const sections: Section[] = [];
  const add = (title: string, level: number, start: number, end: number, h1?: string) => {
    const inside = headings.filter((h) => h.start >= start && h.start < end);
    sections.push({
      id: `s${sections.length}`,
      title,
      level,
      ...(h1 !== undefined && { h1 }),
      start,
      end,
      headings: inside,
      subheadings: inside.filter((h) => h.level > sectionLevel),
    });
  };

  const endOf = (k: number) => (breaks[k] ? breaks[k].start : text.length);
  let i = 0;
  if (breaks[0].level === 1 && sectionLevel > 1) {
    // The H1 title and the text under it, up to the first H2.
    add('Introduction', 0, 0, endOf(1), breaks[0].title);
    i = 1;
  } else if (text.slice(0, breaks[0].start).trim() !== '') {
    add('Introduction', 0, 0, breaks[0].start);
  }
  for (; i < breaks.length; i++) {
    const start = sections.length === 0 ? 0 : breaks[i].start;
    add(breaks[i].title, breaks[i].level, start, endOf(i + 1));
  }
  return sections;
}

export function splitSections(text: string, mode: HeadingMode = 'auto'): Section[] {
  return sectionsFromHeadings(text, findHeadingLines(text, mode));
}
