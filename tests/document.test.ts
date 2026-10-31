// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { analyze, DEFAULT_OPTIONS } from '@/lib/analyze';
import { modelFromHtml } from '@/lib/document';
import { plainTextToHtml } from '@/lib/plainText';
import { sanitizeHtml } from '@/lib/sanitize';
import { tokenize } from '@/lib/tokenize';

const GOOGLE_DOCS =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
  '<h1 dir="ltr"><span style="font-size:20pt">Best GPS Trackers</span></h1>' +
  '<p dir="ltr"><span>Intro about </span><span style="font-weight:700">trackers</span><span>.</span></p>' +
  '<h2 dir="ltr"><span>Battery Life</span></h2>' +
  '<p dir="ltr"><span>Line one.</span><br><span>Line two.</span></p>' +
  '<ul><li dir="ltr"><p dir="ltr"><span>Waterproof</span></p></li><li><span>Light</span><ul><li>Nested item</li></ul></li></ul>' +
  '<h3><span>Sub Heading</span></h3><p>Sub text.</p>' +
  '<div dir="ltr"><table><colgroup><col></colgroup><tbody>' +
  '<tr><td><p><span>Model</span></p></td><td><p><span>Battery</span></p></td></tr>' +
  '<tr><td><p><span>Jiobit</span></p></td><td><p><span>7 days</span></p></td></tr>' +
  '</tbody></table></div>' +
  '<h2><span>Price</span></h2><p><span>Costs vary.</span></p>' +
  '<style>p{color:red}</style><script>alert(1)</script></b>';

describe('sanitizeHtml', () => {
  it('keeps headings, lists, tables and bold; drops styles and scripts', () => {
    const clean = sanitizeHtml(GOOGLE_DOCS);
    expect(clean).toContain('<h1>Best GPS Trackers</h1>');
    expect(clean).toContain('<strong>trackers</strong>');
    expect(clean).toContain('<table>');
    expect(clean).not.toMatch(/style=|<script|<b |dir=|alert/);
  });

  it('never drops text', () => {
    const html = '<div><span>a</span><font>b</font><custom-tag>c</custom-tag><a href="x">d</a><center>e</center><img alt="no">f</div>';
    expect(modelFromHtml(sanitizeHtml(html)).text.replace(/\s/g, '')).toBe('abcdef');
  });
});

describe('modelFromHtml', () => {
  const m = modelFromHtml(sanitizeHtml(GOOGLE_DOCS));

  it('reads every block as its own line', () => {
    expect(m.text).toBe(
      [
        'Best GPS Trackers', 'Intro about trackers.', 'Battery Life', 'Line one.\nLine two.', 'Waterproof', 'Light', 'Nested item',
        'Sub Heading', 'Sub text.', 'Model', 'Battery', 'Jiobit', '7 days', 'Price', 'Costs vary.',
      ].join('\n'),
    );
  });

  it('records exact heading levels and positions', () => {
    expect(m.headings.map((h) => [h.level, h.title, m.text.slice(h.start, h.end)])).toEqual([
      [1, 'Best GPS Trackers', 'Best GPS Trackers'],
      [2, 'Battery Life', 'Battery Life'],
      [3, 'Sub Heading', 'Sub Heading'],
      [2, 'Price', 'Price'],
    ]);
  });

  it('records tables and list nesting', () => {
    expect(m.tableCount).toBe(1);
    const table = m.blocks.find((b) => b.kind === 'table')!;
    expect(table.kind === 'table' && table.rows.map((r) => r.map((c) => m.text.slice(c.start, c.end)))).toEqual([
      ['Model', 'Battery'],
      ['Jiobit', '7 days'],
    ]);
    const list = m.blocks.find((b) => b.kind === 'list')!;
    expect(list.kind === 'list' && list.items.map((i) => i.depth)).toEqual([0, 0, 1]);
  });

  it('gives Introduction + H2 sections, with H3 and the table inside its H2', () => {
    const a = analyze(m.text, DEFAULT_OPTIONS, null, m.headings);
    expect(a.sections.map((s) => s.title)).toEqual(['Introduction', 'Battery Life', 'Price']);
    expect(a.sections[0].h1).toBe('Best GPS Trackers');
    expect(a.sections[1].subheadings).toEqual(['H3 Sub Heading']);
    const battery = a.sections[1].words.find((g) => g.key === 'battery')!;
    expect(battery.count).toBe(2); // heading + table header cell
    expect(a.check.hiddenBySettings).toBe(0);
    expect(a.check.totalWords).toBe(tokenize(m.text).length);
  });

  it('handles text typed directly into the editor (divs and loose text)', () => {
    const typed = modelFromHtml('Loose words<div>typed line</div><div><br></div><div>another <b>bold</b> line</div>');
    expect(typed.text).toBe('Loose words\ntyped line\nanother bold line');
  });

  it('does not run phrases across table cells or list items', () => {
    const t = modelFromHtml('<ul><li>gps tracker</li><li>gps tracker</li></ul><table><tr><td>gps</td><td>tracker</td></tr></table>');
    const a = analyze(t.text, { ...DEFAULT_OPTIONS, headingMode: 'off' }, null, t.headings);
    expect(a.whole.phrases.map((p) => [p.key, p.count])).toEqual([['gps tracker', 2]]);
  });
});

describe('plainTextToHtml', () => {
  it('turns # lines into real headings, bullets into lists and pipes into tables', () => {
    const html = plainTextToHtml('# Title\nIntro.\n\n## Part\n- one\n- two\n\n| a | b |\n|---|---|\n| c | d |\n3. Numbered stays text');
    expect(html).toBe(
      '<h1>Title</h1><p>Intro.</p><h2>Part</h2><ul><li>one</li><li>two</li></ul>' +
        '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>3. Numbered stays text</p>',
    );
  });

  it('keeps every word of the input', () => {
    const text = 'Best Trackers\nGPS trackers help a lot.\n\nBattery Life\nIt <lasts> & lasts.\n• Small\n• Light';
    expect(tokenize(modelFromHtml(plainTextToHtml(text)).text).length).toBe(tokenize(text).length);
  });
});
