/**
 * Reconciles a word's count with what "Find" (Ctrl+F) shows for the same
 * word. Find also matches inside longer words: searching "track" finds
 * "tracker" and "tracking" too. This works out exactly where the extra
 * matches are, so the two numbers can be compared.
 */

import { tokenize } from './tokenize';

interface Range {
  start: number;
  end: number;
}

export interface FindCheck {
  /** The text a reader would search for. */
  needle: string;
  /** Every match Find would show in this part of the text. */
  total: number;
  /** Matches that are this word (or one of its grouped forms). */
  counted: number;
  /** Matches inside other words, most frequent first. */
  elsewhere: { word: string; count: number }[];
}

export function findCheck(text: string, scope: Range, needle: string, occurrences: Range[]): FindCheck | null {
  const lower = text.toLowerCase();
  const find = needle.toLowerCase();
  // Offsets must line up with the original text.
  if (lower.length !== text.length || find.length === 0) return null;

  const tokens = tokenize(text.slice(scope.start, scope.end)).map((t) => ({
    start: t.start + scope.start,
    end: t.end + scope.start,
    word: t.text.toLowerCase(),
  }));
  const own = [...occurrences].sort((a, b) => a.start - b.start);
  const containing = <T extends Range>(list: T[], pos: number): T | undefined => {
    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].end <= pos) lo = mid + 1;
      else if (list[mid].start > pos) hi = mid - 1;
      else return list[mid];
    }
    return undefined;
  };

  let total = 0;
  let counted = 0;
  const elsewhere = new Map<string, number>();
  for (let at = lower.indexOf(find, scope.start); at >= 0 && at + find.length <= scope.end; at = lower.indexOf(find, at + find.length)) {
    total++;
    if (containing(own, at)) counted++;
    else {
      const word = containing(tokens, at)?.word ?? find;
      elsewhere.set(word, (elsewhere.get(word) ?? 0) + 1);
    }
  }
  return {
    needle: find,
    total,
    counted,
    elsewhere: [...elsewhere].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)),
  };
}
