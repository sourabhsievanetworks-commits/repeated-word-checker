// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hasHeadings, htmlToText } from '@/lib/htmlToText';
import { splitSections } from '@/lib/sections';

describe('htmlToText', () => {
  it('converts Google Docs clipboard HTML with exact headings', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
      '<h1 dir="ltr"><span>Best GPS Trackers</span></h1>' +
      '<p dir="ltr"><span>Intro paragraph about </span><span style="font-weight:700">trackers</span><span>.</span></p>' +
      '<h2 dir="ltr"><span>Battery Life</span></h2>' +
      '<p dir="ltr"><span>Line one.</span><br><span>Line two.</span></p>' +
      '<ul><li><p><span>Waterproof</span></p></li><li><span>Light</span></li></ul>' +
      '</b>';
    expect(hasHeadings(html)).toBe(true);
    const text = htmlToText(html);
    expect(text).toBe(
      '# Best GPS Trackers\n\nIntro paragraph about trackers.\n\n## Battery Life\n\nLine one.\nLine two.\n\n- Waterproof\n- Light',
    );
    expect(splitSections(text, 'markdown').map((s) => s.title)).toEqual(['Best GPS Trackers', 'Battery Life']);
  });

  it('handles nested lists', () => {
    expect(htmlToText('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><p>d</p>')).toBe('- a\n- b\n- c\n\nd');
  });

  it('drops scripts and styles', () => {
    expect(htmlToText('<style>p{}</style><h2>A</h2><script>x()</script><p>b</p>')).toBe('## A\n\nb');
  });

  it('says when there are no headings', () => {
    expect(hasHeadings('<p>hello</p><header>x</header>')).toBe(false);
  });
});
