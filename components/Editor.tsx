'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { modelFromElement, modelFromHtml, type DocModel } from '@/lib/document';
import { plainTextToHtml } from '@/lib/plainText';
import { sanitizeHtml } from '@/lib/sanitize';
import { tokenize } from '@/lib/tokenize';

interface Props {
  /** HTML to load. The editor reloads whenever loadKey changes. */
  html: string;
  loadKey: number;
  onChange: (model: DocModel, html: string) => void;
  onPasteNote: (note: string | null) => void;
}

const STYLES = [
  { value: 'p', label: 'Normal text' },
  { value: 'h1', label: 'Heading 1 (title)' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'h5', label: 'Heading 5' },
  { value: 'h6', label: 'Heading 6' },
];

const wordCount = (s: string) => tokenize(s).length;

export default function Editor({ html, loadKey, onChange, onPasteNote }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState('p');
  const [empty, setEmpty] = useState(true);
  const savedRange = useRef<Range | null>(null);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const model = modelFromElement(el);
    setEmpty(model.text.trim() === '');
    onChange(model, el.innerHTML);
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    emit();
    // Only reload when asked to (example, clear, restore), never while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* unsupported */
    }
    // Keep the style menu in step with the block the cursor is in.
    const onSelection = () => {
      const el = ref.current;
      const sel = document.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      if (sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
      let n: Node | null = sel.anchorNode;
      while (n && n !== el) {
        const tag = n.nodeType === 1 ? (n as Element).tagName.toLowerCase() : '';
        if (/^h[1-6]$/.test(tag) || tag === 'p' || tag === 'li' || tag === 'td' || tag === 'th') {
          setStyle(/^h[1-6]$/.test(tag) ? tag : 'p');
          return;
        }
        n = n.parentNode;
      }
      setStyle('p');
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, []);

  const command = (name: string, value?: string) => {
    ref.current?.focus();
    // The style menu takes focus away; put the cursor back where it was.
    const sel = document.getSelection();
    if (savedRange.current && sel && ref.current?.contains(savedRange.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand(name, false, value);
    emit();
  };

  const insertHtml = (clean: string) => {
    if (!document.execCommand('insertHTML', false, clean)) {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !ref.current) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tpl = document.createElement('template');
      tpl.innerHTML = clean;
      range.insertNode(tpl.content);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rawHtml = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    let clean = rawHtml ? sanitizeHtml(rawHtml) : '';
    let fromFormatting = Boolean(clean);
    // Safety net: if the formatted version has fewer words than the plain-text
    // copy of the same clipboard, paste the plain text instead.
    if (!clean || wordCount(modelFromHtml(clean).text) < wordCount(plain)) {
      clean = plainTextToHtml(plain);
      fromFormatting = false;
    }
    insertHtml(clean);
    emit();
    const m = modelFromHtml(clean);
    const parts = [
      m.headings.length && `${m.headings.length} heading${m.headings.length === 1 ? '' : 's'}`,
      m.tableCount && `${m.tableCount} table${m.tableCount === 1 ? '' : 's'}`,
    ].filter(Boolean);
    onPasteNote(
      parts.length
        ? `Pasted ${wordCount(m.text).toLocaleString()} words with ${parts.join(' and ')}${fromFormatting ? ' from your document' : ' (found in plain text, please check the heading levels)'}.`
        : `Pasted ${wordCount(m.text).toLocaleString()} words. No headings found: set them with the style menu.`,
    );
  };

  return (
    <div className="editor-wrap">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <select
          aria-label="Text style"
          value={style}
          onChange={(e) => {
            setStyle(e.target.value);
            command('formatBlock', `<${e.target.value}>`);
          }}
        >
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="tb" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => command('bold')}>
          <b>B</b>
        </button>
        <button type="button" className="tb" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => command('italic')}>
          <i>I</i>
        </button>
        <button type="button" className="tb" title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => command('insertUnorderedList')}>
          • List
        </button>
        <button type="button" className="tb" title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => command('insertOrderedList')}>
          1. List
        </button>
      </div>
      <div className="doc-scroll">
        <div
          ref={ref}
          className={`doc${empty ? ' is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Your blog"
          spellCheck
          data-placeholder="Paste your blog here, straight from Google Docs, WordPress or Word. Headings (H1, H2, H3…) and tables are kept."
          onInput={emit}
          onPaste={onPaste}
        />
      </div>
    </div>
  );
}
