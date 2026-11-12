// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modelFromElement } from '@/lib/document';
import { applyEdits, deletionEdits, sentenceAround } from '@/lib/editing';
import { inflect, matchWritten, readingsOf } from '@/lib/inflect';
import { parseMorphology } from '@/lib/morphology';

const m = parseMorphology(JSON.parse(readFileSync('public/morphology.json', 'utf8')));

function doc(html: string) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return { el, model: modelFromElement(el) };
}
const at = (text: string, word: string, nth = 0) => {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = text.indexOf(word, i + 1);
  return { start: i, end: i + word.length };
};

describe('applyEdits', () => {
  it('replaces exactly the counted word and keeps its formatting', () => {
    const { el, model } = doc('<h2>Battery Life</h2><p>The <strong>battery</strong> lasts. Each   battery\n dies.</p>');
    const second = at(model.text, 'battery', 1);
    expect(applyEdits(el, model, [{ ...second, text: 'cell' }])).toBe(true);
    expect(el.innerHTML).toBe('<h2>Battery Life</h2><p>The <strong>battery</strong> lasts. Each   cell\n dies.</p>');
    const first = at(model.text, 'battery', 0);
    const again = modelFromElement(el);
    expect(applyEdits(el, again, [{ ...at(again.text, 'battery', 0), text: 'pack' }])).toBe(true);
    expect(el.querySelector('strong')!.textContent).toBe('pack');
    expect(first.start).toBeGreaterThan(0);
  });

  it('handles a word split across formatting', () => {
    const { el, model } = doc('<p>A track<b>er</b> helps.</p>');
    expect(applyEdits(el, model, [{ ...at(model.text, 'tracker'), text: 'device' }])).toBe(true);
    expect(el.textContent).toBe('A device helps.');
  });

  it('works inside tables and lists', () => {
    const { el, model } = doc('<ul><li>Long battery</li></ul><table><tr><td>Battery life</td></tr></table>');
    expect(applyEdits(el, model, [{ ...at(model.text, 'battery'), text: 'cell' }, { ...at(model.text, 'Battery'), text: 'Cell' }])).toBe(true);
    expect(el.innerHTML).toBe('<ul><li>Long cell</li></ul><table><tbody><tr><td>Cell life</td></tr></tbody></table>');
  });

  it('changes nothing if the document no longer matches', () => {
    const { el, model } = doc('<p>The battery lasts.</p>');
    el.querySelector('p')!.firstChild!.textContent = 'The charger lasts.';
    expect(applyEdits(el, model, [{ ...at(model.text, 'battery'), text: 'cell' }])).toBe(false);
    expect(el.textContent).toBe('The charger lasts.');
  });

  it('deletes a word with one space and fixes the capital', () => {
    const { el, model } = doc('<p>Very good battery. It is very, very good.</p>');
    expect(applyEdits(el, model, deletionEdits(model, ...Object.values(at(model.text, 'Very')) as [number, number]))).toBe(true);
    expect(el.textContent).toBe('Good battery. It is very, very good.');
    const m2 = modelFromElement(el);
    expect(applyEdits(el, m2, deletionEdits(m2, ...Object.values(at(m2.text, 'very,')).map((n, i) => (i ? n - 1 : n)) as [number, number]))).toBe(true);
    expect(el.textContent).toBe('Good battery. It is very good.');
  });

  it('shows the sentence around a use', () => {
    const text = 'First one. The battery in each tracker was drained, and battery life was logged. Next.';
    const r = at(text, 'battery', 1);
    expect(sentenceAround(text, r.start, r.end)).toEqual({ before: 'The battery in each tracker was drained, and ', word: 'battery', after: ' life was logged.' });
  });
});

describe('inflect', () => {
  it('recognises the form of the written word', () => {
    const r = (w: string, base: string) => readingsOf(m, w, base).map((x) => `${x.kind}:${x.form}`).sort();
    expect(r('bought', 'buy')).toEqual(['verb:past']);
    expect(r('tracked', 'track')).toEqual(['verb:past']);
    expect(r('Tracking', 'track')).toEqual(['verb:ing']);
    expect(r('tracks', 'track')).toEqual(['noun:plural', 'verb:third']);
    expect(r('batteries', 'battery')).toEqual(['noun:plural']);
    expect(r('bigger', 'big')).toEqual(['adjective:comparative']);
    expect(r('biggest', 'big')).toEqual(['adjective:superlative']);
    expect(r("tracker's", 'tracker')).toEqual(['noun:base']);
    expect(r('use', 'use')).toEqual(['noun:base', 'verb:base']);
  });

  it('puts the replacement in the same form', () => {
    expect(inflect(m, 'purchase', 'past')).toEqual(['purchased']);
    expect(inflect(m, 'stop', 'past')).toEqual(['stopped']);
    expect(inflect(m, 'carry', 'past')).toEqual(['carried']);
    expect(inflect(m, 'take', 'past').sort()).toEqual(['taken', 'took']);
    expect(inflect(m, 'jog', 'ing')).toEqual(['jogging']);
    expect(inflect(m, 'make', 'ing')).toEqual(['making']);
    expect(inflect(m, 'die', 'ing')).toEqual(['dying']);
    expect(inflect(m, 'see', 'ing')).toEqual(['seeing']);
    expect(inflect(m, 'device', 'plural')).toEqual(['devices']);
    expect(inflect(m, 'box', 'plural')).toEqual(['boxes']);
    expect(inflect(m, 'city', 'plural')).toEqual(['cities']);
    expect(inflect(m, 'child', 'plural')).toEqual(['children']);
    expect(inflect(m, 'reach', 'third')).toEqual(['reaches']);
    expect(inflect(m, 'large', 'comparative')).toEqual(['larger']);
    expect(inflect(m, 'big', 'superlative')).toEqual(['biggest']);
    expect(inflect(m, 'happy', 'comparative')).toEqual(['happier']);
    expect(inflect(m, 'reliable', 'comparative')).toEqual(['more reliable']);
    expect(inflect(m, 'good', 'comparative')).toEqual(['better']);
  });

  it('keeps capitals and possessives', () => {
    expect(matchWritten('Tracker', 'device')).toBe('Device');
    expect(matchWritten('GPS', 'satnav')).toBe('SATNAV');
    expect(matchWritten("tracker's", 'device')).toBe("device's");
    expect(matchWritten('Tracker’s', 'device')).toBe('Device’s');
    expect(matchWritten('battery', 'cell')).toBe('cell');
  });
});

describe('deleting from a list', () => {
  it('removes the word and its comma', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>Apples, pears, and plums.</p>';
    const model = modelFromElement(el);
    const i = model.text.indexOf('pears');
    expect(applyEdits(el, model, deletionEdits(model, i, i + 5))).toBe(true);
    expect(el.textContent).toBe('Apples, and plums.');
  });

  it('removes the space before a word that ends a sentence', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>It is very. Next.</p>';
    const model = modelFromElement(el);
    const i = model.text.indexOf('very');
    expect(applyEdits(el, model, deletionEdits(model, i, i + 4))).toBe(true);
    expect(el.textContent).toBe('It is. Next.');
  });
});
