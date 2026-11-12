/**
 * "Word forms" grouping using a machine-learning NLP model (wink-nlp with the
 * wink-eng-lite-web-model English model). The model reads each word in its
 * sentence, tags its part of speech and returns its dictionary form (lemma):
 * "trackers" -> "tracker", "ran" -> "run", "studies" -> "study".
 *
 * The model never changes how many words are counted. It only decides which
 * of our own tokens share a group (see wordForms.ts). Whenever it disagrees
 * with our tokenizer, the word falls back to its exact form, so a model mistake
 * can only affect grouping, never the counts.
 */

export interface LemmaSpan {
  start: number;
  end: number;
  value: string;
  lemma: string;
  pos: string;
}

export type Lemmatizer = (text: string) => LemmaSpan[];

/**
 * Lower-cases character by character so offsets stay identical. The model
 * lemmatises far better on lower-case text: capitalised words at the start of
 * a sentence or in a heading are otherwise tagged as proper nouns and skipped.
 */
function lowerSameLength(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

// Minimal shape of the parts of wink-nlp we use.
interface WinkLike {
  readDoc(text: string): {
    tokens(): {
      out(f: unknown): string[];
    };
  };
  its: Record<string, unknown>;
}

export function createLemmatizer(nlp: WinkLike): Lemmatizer {
  const its = nlp.its;
  return (text: string) => {
    const lower = lowerSameLength(text);
    const doc = nlp.readDoc(lower);
    const values = doc.tokens().out(its.value);
    const lemmas = doc.tokens().out(its.lemma);
    const pos = doc.tokens().out(its.pos);
    const spans: LemmaSpan[] = [];
    let cursor = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!v || /^\s+$/.test(v)) continue;
      const at = lower.indexOf(v, cursor);
      // Only accept positions right after whitespace we skipped; otherwise the
      // model and the text disagree and we leave this token unmapped.
      if (at < 0 || !/^\s*$/.test(lower.slice(cursor, at))) continue;
      spans.push({ start: at, end: at + v.length, value: v, lemma: lemmas[i], pos: pos[i] });
      cursor = at + v.length;
    }
    return spans;
  };
}

let loading: Promise<Lemmatizer> | null = null;

/** Loads the model on demand (about 1 MB gzipped), once per page. */
export function loadLemmatizer(): Promise<Lemmatizer> {
  loading ??= Promise.all([import('wink-nlp'), import('wink-eng-lite-web-model')]).then(
    ([wink, model]) => createLemmatizer(wink.default(model.default) as unknown as WinkLike),
  );
  return loading;
}
