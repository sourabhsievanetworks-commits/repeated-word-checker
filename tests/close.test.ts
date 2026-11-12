import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_OPTIONS } from '@/lib/analyze';

const run = (text: string, closeWindow = 12) => analyze(text, { ...DEFAULT_OPTIONS, closeWindow });
const word = (text: string, key: string, closeWindow = 12) => run(text, closeWindow).whole.words.find((g) => g.key === key)!;

describe('close repeats', () => {
  it('counts uses that follow the previous use within the window', () => {
    // fee at word 4, 8 and 30
    const text = 'There is a fee and that fee rises ' + 'word '.repeat(21) + 'fee again.';
    const fee = word(text, 'fee');
    expect(fee.count).toBe(3);
    expect(fee.close).toBe(1);
    expect(fee.closeAt).toEqual([true, true, false]);
  });

  it('counts each close repeat in a run', () => {
    const fee = word('Battery, battery, battery! Then nothing.', 'battery');
    expect(fee.close).toBe(2);
    expect(fee.closeAt).toEqual([true, true, true]);
  });

  it('respects the window size', () => {
    const text = 'tracker one two three four five tracker';
    expect(word(text, 'tracker', 6).close).toBe(1);
    expect(word(text, 'tracker', 5).close).toBe(0);
  });

  it('does not count a heading and the sentence after it as close', () => {
    const text = '# Title\nIntro text here.\n## Battery Life\nBattery life matters most to parents.';
    expect(word(text, 'battery').close).toBe(0);
    expect(word(text, 'battery').count).toBe(2);
  });

  it('has no close repeats for words used once', () => {
    for (const g of run('One two three four.').whole.words) expect([g.close, g.closeAt]).toEqual([0, [false]]);
  });
});
