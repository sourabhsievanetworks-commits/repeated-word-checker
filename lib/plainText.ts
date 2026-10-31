/**
 * Turns plain text (a plain-text paste, or text saved by the first version
 * of the app) into editor HTML: "#" lines and detected title lines become real
 * headings, "- " / "• " lines become bullet lists, and "| a | b |" lines
 * become tables. Every word of the input is kept.
 */

import { escapeHtml } from './sanitize';
import { findHeadingLines } from './sections';

const BULLET_RE = /^\s*([-*•–▪●])\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_RULE_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  const headingAt = new Map(findHeadingLines(normalized).map((h) => [h.start, h]));
  const lines: { start: number; text: string }[] = [];
  let at = 0;
  for (const l of normalized.split('\n')) {
    lines.push({ start: at, text: l });
    at += l.length + 1;
  }

  const out: string[] = [];
  let list: string[] | null = null;
  let table: string[][] | null = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.map((i) => `<li>${i}</li>`).join('')}</ul>`);
    if (table) {
      out.push(
        `<table><tbody>${table.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
    }
    list = null;
    table = null;
  };

  for (const l of lines) {
    const h = headingAt.get(l.start);
    if (h) {
      flush();
      out.push(`<h${h.level}>${escapeHtml(h.title)}</h${h.level}>`);
      continue;
    }
    const t = l.text.trim();
    if (!t) {
      flush();
      continue;
    }
    if (TABLE_ROW_RE.test(t)) {
      if (list) flush();
      if (TABLE_RULE_RE.test(t)) continue;
      table ??= [];
      table.push(t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
      continue;
    }
    const bullet = BULLET_RE.exec(t);
    if (bullet) {
      if (table) flush();
      list ??= [];
      list.push(escapeHtml(bullet[2]));
      continue;
    }
    flush();
    out.push(`<p>${escapeHtml(t)}</p>`);
  }
  flush();
  return out.join('');
}
