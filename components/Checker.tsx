'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { analyze, parseWordList, type Group, type ScopeResult } from '@/lib/analyze';
import type { DocModel } from '@/lib/document';
import { loadMorphology, type Morphology } from '@/lib/morphology';
import { plainTextToHtml } from '@/lib/plainText';
import { buildReport } from '@/lib/report';
import { SAMPLE_TEXT } from '@/lib/sample';
import { sanitizeHtml } from '@/lib/sanitize';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/settings';
import Editor, { type EditorApi } from './Editor';
import type { Edit } from '@/lib/editing';
import HighlightView from './HighlightView';
import Results, { type Selection } from './Results';
import SettingsPanel from './SettingsPanel';

const HTML_KEY = 'rwc:html';
/** Plain text saved by the first version of the app; converted on load. */
const OLD_TEXT_KEY = 'rwc:text';
// v3: word forms are grouped by default; older saved settings counted exact spellings.
const SETTINGS_KEY = 'rwc:settings:v3';

const EMPTY_MODEL: DocModel = { text: '', blocks: [], headings: [], tableCount: 0 };

type DictionaryState = 'idle' | 'loading' | 'ready' | 'error';

export default function Checker() {
  const [loadHtml, setLoadHtml] = useState('');
  const [loadKey, setLoadKey] = useState(0);
  const [doc, setDoc] = useState<DocModel>(EMPTY_MODEL);
  const [savedHtml, setSavedHtml] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [restored, setRestored] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const editorApi = useRef<EditorApi | null>(null);
  const lastName = useRef('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [morphology, setMorphology] = useState<Morphology | null>(null);
  const [dictionaryState, setDictionaryState] = useState<DictionaryState>('idle');

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
    if (settings.mode !== 'forms' || morphology) return;
    setDictionaryState('loading');
    loadMorphology()
      .then((m) => {
        setMorphology(m);
        setDictionaryState('ready');
      })
      .catch(() => setDictionaryState('error'));
  }, [settings.mode, morphology]);

  const onEditorChange = useCallback((model: DocModel, html: string) => {
    setDoc(model);
    setSavedHtml(html);
  }, []);

  const analysed = useDeferredValue(doc);
  const useForms = settings.mode === 'forms' && morphology !== null;

  const { mode, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords, separateWords, closeWindow } = settings;
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
          separateWords: parseWordList(separateWords),
          closeWindow,
        },
        morphology,
        analysed.headings,
      ),
    [analysed, useForms, commonWords, includeHeadings, includeNumbers, splitHyphens, headingMode, ignoreWords, separateWords, closeWindow, morphology],
  );

  const selected = useMemo(() => {
    if (!selection) return null;
    const scope: ScopeResult | undefined =
      selection.scopeId === 'all' ? analysis.whole : analysis.sections.find((s) => s.id === selection.scopeId);
    const list = selection.kind === 'word' ? scope?.words : scope?.phrases;
    const group: Group | undefined = list?.find((g) => g.key === selection.key);
    return scope && group ? { scope, group } : null;
  }, [selection, analysis]);

  // How often each word is already used, so suggested alternatives can say so.
  const usage = useMemo(() => new Map(analysis.whole.words.map((g) => [g.key, g.count])), [analysis]);

  // "Count separately": remember a spelling that should never be grouped.
  const separate = (spelling: string) =>
    setSettings((s) => ({ ...s, separateWords: [s.separateWords.trim(), spelling].filter(Boolean).join(', ') }));

  if (selected) lastName.current = selected.group.display;

  // Every overused word, worst first: the order of "Next word to fix".
  const { commonWords: commonMode, sectionWarn, wholeWarn } = settings;
  const issues = useMemo(() => {
    const quiet = (g: Group) => commonMode === 'separate' && (g.common || g.number || g.link);
    const list: { sel: Selection; label: string; count: number }[] = [];
    for (const s of analysis.sections)
      for (const g of s.words)
        if (!quiet(g) && g.count >= sectionWarn) list.push({ sel: { scopeId: s.id, kind: 'word', key: g.key }, label: `“${g.display}” in ${s.title}`, count: g.count });
    list.sort((a, b) => b.count - a.count);
    for (const g of analysis.whole.words)
      if (!quiet(g) && g.count >= wholeWarn) list.push({ sel: { scopeId: 'all', kind: 'word', key: g.key }, label: `“${g.display}” in the whole blog`, count: g.count });
    return list;
  }, [analysis, commonMode, sectionWarn, wholeWarn]);

  const sameSelection = (a: Selection, b: Selection) => a.scopeId === b.scopeId && a.kind === b.kind && a.key === b.key;
  const nextIssue = (() => {
    if (!selection) return issues[0] ?? null;
    const at = issues.findIndex((i) => sameSelection(i.sel, selection));
    return (at >= 0 ? issues[at + 1] : null) ?? issues.find((i) => !sameSelection(i.sel, selection)) ?? null;
  })();
  const open = (sel: Selection | null) => {
    setSelection(sel);
    setLastMessage(null);
  };
  const next = nextIssue ? { label: nextIssue.label, go: () => open(nextIssue.sel) } : null;

  // Fixes are applied only when the results match the document exactly.
  const busy = analysed !== doc;
  const applyFix = (edits: Edit[], message: string) => {
    const ok = !busy && (editorApi.current?.apply(analysed, edits) ?? false);
    if (ok) setLastMessage(message);
    return ok;
  };
  const undoFix = () => {
    if (editorApi.current?.undo()) setLastMessage('Undone. The text is back as it was.');
  };
  const limitFor = (scopeId: string) => Math.max(1, (scopeId === 'all' ? wholeWarn : sectionWarn) - 1);

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
          <div className="editor-host" hidden={Boolean(selection)}>
            <Editor html={loadHtml} loadKey={loadKey} onChange={onEditorChange} onPasteNote={setPasteNote} apiRef={editorApi} />
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
              usage={usage}
              onSeparate={useForms ? separate : undefined}
              onClose={() => open(null)}
              morphology={useForms ? morphology : null}
              busy={busy}
              limit={limitFor(selected.scope.id)}
              onApply={applyFix}
              onUndo={undoFix}
              undoCount={editorApi.current?.undoCount() ?? 0}
              lastMessage={lastMessage}
              next={next}
            />
          )}
          {selection && !selected && (
            <div className="highlight">
              <div className="goal done">
                <span>✓ “{lastName.current}” is no longer used here.</span>
                {next && (
                  <button type="button" className="btn sm" onClick={next.go}>
                    Next word to fix: {next.label} →
                  </button>
                )}
                <button type="button" className="btn ghost sm" onClick={() => open(null)}>
                  Back to editing
                </button>
              </div>
              {lastMessage && (
                <div className="fix-done">
                  <span>{lastMessage}</span>
                  {(editorApi.current?.undoCount() ?? 0) > 0 && (
                    <button type="button" className="btn ghost sm" onClick={undoFix} disabled={busy}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="pane results" aria-label="Repeated words">
          <SettingsPanel settings={settings} onChange={setSettings} dictionaryState={dictionaryState} />
          {mode === 'forms' && dictionaryState === 'loading' && (
            <p className="banner">Loading the dictionary… showing exact spellings until it is ready.</p>
          )}
          {mode === 'forms' && dictionaryState === 'error' && (
            <p className="banner error">The dictionary could not load. Showing exact spellings instead.</p>
          )}
          {analysed.text.trim() ? (
            <Results
              analysis={analysis}
              settings={settings}
              selection={selection}
              onSelect={open}
              onStartFixing={issues.length ? () => open(issues[0].sel) : undefined}
              issueCount={issues.length}
            />
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
