'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { analyze, parseWordList, type Group, type ScopeResult } from '@/lib/analyze';
import { hasHeadings, htmlToText } from '@/lib/htmlToText';
import { tokenize } from '@/lib/tokenize';
import { loadLemmatizer, type Lemmatizer } from '@/lib/lemmatizer';
import { buildReport } from '@/lib/report';
import { SAMPLE_TEXT } from '@/lib/sample';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';
import HighlightView from './HighlightView';
import Results, { type Selection } from './Results';
import SettingsPanel from './SettingsPanel';

const TEXT_KEY = 'rwc:text';
// v2: every word is counted by default; older saved settings hid common words.
const SETTINGS_KEY = 'rwc:settings:v2';

type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export default function Checker() {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [restored, setRestored] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lemmatizer, setLemmatizer] = useState<Lemmatizer | null>(null);
  const [modelState, setModelState] = useState<ModelState>('idle');

  // Restore the last draft and settings (this browser only).
  useEffect(() => {
    try {
      const t = localStorage.getItem(TEXT_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (t) setText(t);
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {
      /* storage unavailable */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(TEXT_KEY, text);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [text, settings, restored]);

  useEffect(() => {
    if (settings.mode !== 'forms' || lemmatizer) return;
    setModelState('loading');
    loadLemmatizer()
      .then((l) => {
        setLemmatizer(() => l);
        setModelState('ready');
      })
      .catch(() => setModelState('error'));
  }, [settings.mode, lemmatizer]);

  const analysedText = useDeferredValue(text);
  const useForms = settings.mode === 'forms' && lemmatizer !== null;
  const lemmaSpans = useMemo(
    () => (useForms && lemmatizer ? lemmatizer(analysedText) : null),
    [useForms, lemmatizer, analysedText],
  );

  const { mode, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords } = settings;
  const analysis = useMemo(
    () =>
      analyze(
        analysedText,
        {
          mode: useForms ? 'forms' : 'exact',
          ignoreStopwords: commonWords === 'hide',
          includeHeadings,
          includeNumbers,
          splitHyphens,
          headingMode,
          ignoreWords: parseWordList(ignoreWords),
        },
        lemmaSpans,
      ),
    [analysedText, useForms, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords, lemmaSpans],
  );

  const selected = useMemo(() => {
    if (!selection) return null;
    const scope: ScopeResult | undefined =
      selection.scopeId === 'all' ? analysis.whole : analysis.sections.find((s) => s.id === selection.scopeId);
    const list = selection.kind === 'word' ? scope?.words : scope?.phrases;
    const group: Group | undefined = list?.find((g) => g.key === selection.key);
    return scope && group ? { scope, group } : null;
  }, [selection, analysis]);

  const headingCount = analysis.sections.filter((s) => s.level > 0).length;

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html || !hasHeadings(html)) {
      setPasteNote(null);
      return;
    }
    const converted = htmlToText(html);
    // Safety net: never accept a conversion that has fewer words than the
    // plain-text copy of the same clipboard. Fall back to the plain paste.
    const plain = e.clipboardData.getData('text/plain');
    if (!converted || tokenize(converted).length < tokenize(plain).length) {
      setPasteNote(null);
      return;
    }
    e.preventDefault();
    const ta = e.currentTarget;
    // insertText keeps the browser's undo history; fall back to a direct update.
    if (!document.execCommand('insertText', false, converted)) {
      const { selectionStart, selectionEnd, value } = ta;
      setText(value.slice(0, selectionStart) + converted + value.slice(selectionEnd));
    }
    const n = (converted.match(/^#{1,6} /gm) ?? []).length;
    setPasteNote(`Kept ${n} heading${n === 1 ? '' : 's'} from the pasted document, so sections match it exactly.`);
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(analysis, settings));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Repeated Word Checker</h1>
          <p className="sub">Paste your blog. See which words repeat in each section, and how many times.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => { setText(SAMPLE_TEXT); setSelection(null); setPasteNote(null); }}>
            Try an example
          </button>
          <button type="button" className="btn ghost" onClick={() => { setText(''); setSelection(null); setPasteNote(null); }} disabled={!text}>
            Clear
          </button>
          <button type="button" className="btn" onClick={copyReport} disabled={!text.trim()}>
            {copied ? 'Copied' : 'Copy report'}
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="pane editor" aria-label="Your text">
          {selected ? (
            <HighlightView
              text={analysedText}
              group={selected.group}
              scope={selected.scope}
              kind={selection!.kind}
              onClose={() => setSelection(null)}
            />
          ) : (
            <>
              <textarea
                className="input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                spellCheck={false}
                placeholder={'Paste your blog here.\n\nTip: copy straight from Google Docs, WordPress or Word and the headings are kept, so each section is checked on its own.\nIn plain text, start heading lines with ## (for example "## Battery Life").'}
              />
              <div className="status">
                <span>{analysis.whole.wordCount.toLocaleString()} words</span>
                <span>
                  {headingCount} heading{headingCount === 1 ? '' : 's'} found
                </span>
                {pasteNote && <span className="note">{pasteNote}</span>}
              </div>
            </>
          )}
        </section>

        <section className="pane results" aria-label="Repeated words">
          <SettingsPanel settings={settings} onChange={setSettings} modelState={modelState} />
          {mode === 'forms' && modelState === 'loading' && (
            <p className="banner">Loading the language model… showing exact words until it is ready.</p>
          )}
          {mode === 'forms' && modelState === 'error' && (
            <p className="banner error">The language model could not load. Showing exact words instead.</p>
          )}
          {analysedText.trim() ? (
            <Results analysis={analysis} settings={settings} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="empty">
              <p>Your results will appear here.</p>
              <p className="muted">Each word is shown as “battery — used 6 times”, section by section.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        Your text stays in your browser. It is never uploaded.
      </footer>
    </div>
  );
}
