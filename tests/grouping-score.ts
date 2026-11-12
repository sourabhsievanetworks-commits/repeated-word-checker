import { analyze, DEFAULT_OPTIONS } from '@/lib/analyze';
import type { Lemmatizer } from '@/lib/lemmatizer';
import type { BenchmarkCase } from './grouping-benchmark';

export interface Failure {
  text: string;
  kind: 'same' | 'apart';
  words: string[];
  got: string;
}

/** Runs the benchmark and returns how many expectations hold. */
export function scoreGrouping(lemmatize: Lemmatizer, cases: BenchmarkCase[]): { total: number; passed: number; failures: Failure[] } {
  let total = 0;
  const failures: Failure[] = [];
  for (const c of cases) {
    const a = analyze(c.text, { ...DEFAULT_OPTIONS, mode: 'forms', headingMode: 'off' }, lemmatize(c.text));
    const groupsOf = (form: string) => a.whole.words.filter((g) => g.forms.some((f) => f.form === form)).map((g) => g.key);
    const describe = (words: string[]) => words.map((w) => `${w}→[${groupsOf(w).join(',')}]`).join(' ');
    for (const words of c.same ?? []) {
      total++;
      const groups = new Set(words.flatMap(groupsOf));
      if (groups.size !== 1 || words.some((w) => groupsOf(w).length !== 1)) failures.push({ text: c.text, kind: 'same', words, got: describe(words) });
    }
    for (const words of c.apart ?? []) {
      total++;
      const [x, y] = words.map(groupsOf);
      if (x.some((k) => y.includes(k))) failures.push({ text: c.text, kind: 'apart', words, got: describe(words) });
    }
  }
  return { total, passed: total - failures.length, failures };
}
