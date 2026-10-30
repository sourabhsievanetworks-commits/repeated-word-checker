import { DEFAULT_OPTIONS, type AnalyzeOptions } from './analyze';

export interface Settings extends Omit<AnalyzeOptions, 'ignoreWords'> {
  ignoreWords: string;
  /** Hide words used fewer times than this. */
  minCount: number;
  sectionWarn: number;
  sectionHigh: number;
  wholeWarn: number;
  wholeHigh: number;
  showPhrases: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ...DEFAULT_OPTIONS,
  ignoreWords: '',
  minCount: 2,
  sectionWarn: 3,
  sectionHigh: 5,
  wholeWarn: 8,
  wholeHigh: 12,
  showPhrases: true,
};

export type Severity = 'ok' | 'warn' | 'high';

export function severity(count: number, warn: number, high: number): Severity {
  if (count >= high) return 'high';
  if (count >= warn) return 'warn';
  return 'ok';
}
