'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { analyze, parseWordList, type Group, type ScopeResult } from '@/lib/analyze';
import type { DocModel } from '@/lib/document';
import { loadLemmatizer, type Lemmatizer } from '@/lib/lemmatizer';
import { plainTextToHtml } from '@/lib/plainText';
import { buildReport } from '@/lib/report';
import { SAMPLE_TEXT } from '@/lib/sample';
import { sanitizeHtml } from '@/lib/sanitize';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';
import Editor from './Editor';
import HighlightView from './HighlightView';
import Results, { type Selection } from './Results';
import SettingsPanel from './SettingsPanel';

const HTML_KEY = 'rwc:html';
/** Plain text saved by the first version of the app; converted on load. */
const OLD_TEXT_KEY = 'rwc:text';
// v2: every word is counted by default; older saved settings hid common words.
const SETTINGS_KEY = 'rwc:settings:v2';

const EMPTY_MODEL: DocModel = { text: '', blocks: [], headings: [], tableCount: 0 };

type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export default function Checker() {
  const [loadHtml, setLoadHtml] = useState('');
  const [loadKey, setLoadKey] = useState(0);
  const [doc, setDoc] = useState<DocModel>(EMPTY_MODEL);
  const [savedHtml, setSavedHtml] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [restored, setRestored] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lemmatizer, setLemmatizer] = useState<Lemmatizer | null>(null);
  const [modelState, setModelState] = useState<ModelState>('idle');

  const load = (html: string) => {
    setLoadHtml(html);
    setLoadKey((k) => k + 1);
    setSelection(null);
    setPasteNote(null);
  };

  // Restore the last draft and settings (this browser only).
  useEffect(() => {
    try {
      const html = localStorage.getItem(HTML_KEY);
      const oldText = localStorage.getItem(OLD_TEXT_KEY);
      const s = localStorage.getItem(SETTINGS_KEY);
      if (html) load(sanitizeHtml(html));
      else if (oldText) load(plainTextToHtml(oldText));
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
    } catch {
      /* storage unavailable */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(HTML_KEY, savedHtml);
      localStorage.removeItem(OLD_TEXT_KEY);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
  }, [savedHtml, settings, restored]);

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

  const onEditorChange = useCallback((model: DocModel, html: string) => {
    setDoc(model);
    setSavedHtml(html);
  }, []);

  const analysed = useDeferredValue(doc);
  const useForms = settings.mode === 'forms' && lemmatizer !== null;
  const lemmaSpans = useMemo(
    () => (useForms && lemmatizer ? lemmatizer(analysed.text) : null),
    [useForms, lemmatizer, analysed],
  );

  const { mode, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords } = settings;
  const analysis = useMemo(
    () =>
      analyze(
        analysed.text,
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
        analysed.headings,
      ),
    [analysed, useForms, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords, lemmaSpans],
  );

  const selected = useMemo(() => {
    if (!selection) return null;
    const scope: ScopeResult | undefined =
      selection.scopeId === 'all' ? analysis.whole : analysis.sections.find((s) => s.id === selection.scopeId);
    const list = selection.kind === 'word' ? scope?.words : scope?.phrases;
    const group: Group | undefined = list?.find((g) => g.key === selection.key);
    return scope && group ? { scope, group } : null;
  }, [selection, analysis]);

  const levelCounts = [1, 2, 3, 4, 5, 6]
    .map((l) => [l, doc.headings.filter((h) => h.level === l).length] as const)
    .filter(([, n]) => n > 0);

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
          <p className="sub">Paste your blog. See which words repeat in the introduction and in every H2 section, and how many times.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => load(plainTextToHtml(SAMPLE_TEXT))}>
            Try an example
          </button>
          <button type="button" className="btn ghost" onClick={() => load('')} disabled={!doc.text}>
            Clear
          </button>
          <button type="button" className="btn" onClick={copyReport} disabled={!doc.text.trim()}>
            {copied ? 'Copied' : 'Copy report'}
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="pane editor" aria-label="Your blog">
          {/* The editor stays mounted (hidden) while highlights show, so nothing is lost. */}
          <div className="editor-host" hidden={Boolean(selected)}>
            <Editor html={loadHtml} loadKey={loadKey} onChange={onEditorChange} onPasteNote={setPasteNote} />
            <div className="status">
              <span>{analysis.check.totalWords.toLocaleString()} words</span>
              {levelCounts.length ? (
                <span>{levelCounts.map(([l, n]) => `H${l} ×${n}`).join(' · ')}</span>
              ) : (
                <span>No headings</span>
              )}
              {doc.tableCount > 0 && (
                <span>
                  {doc.tableCount} table{doc.tableCount === 1 ? '' : 's'}
                </span>
              )}
              {pasteNote && <span className="note">{pasteNote}</span>}
            </div>
          </div>
          {selected && (
            <HighlightView
              doc={analysed}
              group={selected.group}
              scope={selected.scope}
              kind={selection!.kind}
              onClose={() => setSelection(null)}
            />
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
          {analysed.text.trim() ? (
            <Results analysis={analysis} settings={settings} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="empty">
              <p>Your results will appear here.</p>
              <p className="muted">The introduction and each H2 section are checked on their own, with a full table of every word.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="foot">Your text stays in your browser. It is never uploaded.</footer>
    </div>
  );
}
