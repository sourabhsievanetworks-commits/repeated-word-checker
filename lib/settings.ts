import { DEFAULT_OPTIONS, type AnalyzeOptions } from './analyze';

/**
 * Common words (the, and, is…):
 *  - "separate": counted and listed in their own group, never flagged (default)
 *  - "flag": treated like any other word
 *  - "hide": not counted at all
 */
export type CommonWords = 'separate' | 'flag' | 'hide';

export interface Settings extends Omit<AnalyzeOptions, 'ignoreWords' | 'ignoreStopwords'> {
  commonWords: CommonWords;
  ignoreWords: string;
  sectionWarn: number;
  sectionHigh: number;
  wholeWarn: number;
  wholeHigh: number;
  showPhrases: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_OPTIONS,
  commonWords: 'separate',
  ignoreWords: '',
  sectionWarn: 3,
  sectionHigh: 5,
  wholeWarn: 8,
  wholeHigh: 12,
  showPhrases: true,
};

export type Severity = 'ok' | 'warn' | 'high' | 'common';

export function severity(count: number, warn: number, high: number): Severity {
  if (count >= high) return 'high';
  if (count >= warn) return 'warn';
  return 'ok';
}
