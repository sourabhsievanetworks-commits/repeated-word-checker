# Repeated Word Checker

Paste a blog post and see which words and phrases you repeat, both **in each section** and **across the whole post**, shown as "battery — used 6 times".

## Features

- **Section by section.** The text is split at its headings, and each section gets its own list of repeated words.
- **Keeps real headings from Google Docs, WordPress and Word.** Paste straight from the editor and the H1/H2/H3 structure is kept exactly. In plain text, start heading lines with `#`, `##` or `###`.
- **Colour levels.** Green is fine, amber is repetitive, red is overused. You can change the limits for a single section and for the whole blog.
- **Click a word to see every place it is used.** Each place is highlighted and numbered, and you can step through them one by one.
- **Repeated phrases** of 2–3 words (for example "GPS tracker"). Phrases never cross punctuation or line breaks.
- **Word forms (AI).** An English NLP model ([wink-nlp](https://winkjs.org/wink-nlp/)) groups forms of the same word, such as *tracker / trackers / tracker's*, *study / studies / studied* and *run / ran / running*. The spellings it grouped are always listed, so you can see exactly what was merged.
- Common words (the, and, is…) are ignored by default. You can also give your own list of words to skip, such as brand names.
- Copy a plain-text report. Your text never leaves the browser.

## How counting works

Counts come from a deterministic tokenizer (`lib/tokenize.ts`), not from a model, so the same text always gives the same numbers.

- Matching ignores case: *Tracker* = *tracker*.
- Contractions and hyphenated words are one word: *don't*, *real-time*, *co-founder*.
- Curly and straight apostrophes are treated the same. So are accented letters typed in different ways.
- Abbreviations like *U.S.* and *e.g.* stay whole.
- Numbers count toward the total word count but are never listed as repeated words.
- Heading text is left out of the counts by default. Turn on "Count words in headings too" to include it.

In **Word forms** mode the model only decides *which group* a word belongs to. It never changes how many words are counted. Whenever the model and the tokenizer disagree, the word stays in its exact form. The model also never joins words that look different, such as *best* and *good*.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests, including 300 randomised cross-checks against an independent counter
npm run build
```

## Deploy

This is a standard Next.js app with no environment variables. On Vercel, choose **Add New → Project**, import this GitHub repository and click **Deploy**. Every push to `main` redeploys it.
