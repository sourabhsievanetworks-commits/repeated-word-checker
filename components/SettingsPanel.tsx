'use client';

import { useState } from 'react';
import type { HeadingMode } from '@/lib/sections';
import type { Settings } from '@/lib/settings';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  modelState: 'idle' | 'loading' | 'ready' | 'error';
}

export default function SettingsPanel({ settings, onChange, modelState }: Props) {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const num = (k: 'minCount' | 'sectionWarn' | 'sectionHigh' | 'wholeWarn' | 'wholeHigh') => (
    <input
      type="number"
      min={1}
      max={999}
      value={settings[k]}
      onChange={(e) => {
        const v = Math.round(Number(e.target.value));
        if (Number.isFinite(v) && v >= 1) set(k, v);
      }}
    />
  );

  return (
    <div className="settings">
      <div className="settings-main">
        <div className="seg" role="radiogroup" aria-label="How to count">
          <button type="button" role="radio" aria-checked={settings.mode === 'exact'} onClick={() => set('mode', 'exact')}>
            Exact words
          </button>
          <button type="button" role="radio" aria-checked={settings.mode === 'forms'} onClick={() => set('mode', 'forms')}>
            Word forms (AI){settings.mode === 'forms' && modelState === 'loading' ? '…' : ''}
          </button>
        </div>
        <button type="button" className="btn ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide settings' : 'Settings'}
        </button>
      </div>
      <p className="hint">
        {settings.mode === 'exact'
          ? 'Counts each spelling separately: “tracker” and “trackers” are two words.'
          : 'An English language model groups forms of the same word: tracker, trackers, tracker’s → “tracker”. Grouped spellings are listed under each word.'}
      </p>

      {open && (
        <div className="settings-grid">
          <label className="check">
            <input type="checkbox" checked={settings.ignoreStopwords} onChange={(e) => set('ignoreStopwords', e.target.checked)} />
            Ignore common words (the, and, is, of…)
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.includeHeadings} onChange={(e) => set('includeHeadings', e.target.checked)} />
            Count words in headings too
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.showPhrases} onChange={(e) => set('showPhrases', e.target.checked)} />
            Show repeated phrases (2–3 words)
          </label>
          <label className="field">
            Find headings
            <select value={settings.headingMode} onChange={(e) => set('headingMode', e.target.value as HeadingMode)}>
              <option value="auto">Automatically</option>
              <option value="markdown">Only lines starting with #</option>
              <option value="off">Don’t split into sections</option>
            </select>
          </label>
          <fieldset className="limits">
            <legend>Limits</legend>
            <label>In one section: repetitive at {num('sectionWarn')} overused at {num('sectionHigh')}</label>
            <label>In the whole blog: repetitive at {num('wholeWarn')} overused at {num('wholeHigh')}</label>
            <label>List words used at least {num('minCount')} times</label>
          </fieldset>
          <label className="field wide">
            Words to skip (brand names, your main keyword…), separated by commas
            <input type="text" value={settings.ignoreWords} placeholder="e.g. Garmin, inReach" onChange={(e) => set('ignoreWords', e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
