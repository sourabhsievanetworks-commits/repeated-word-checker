# Repeated Word Checker

Paste a blog post and see which words and phrases you repeat, both **in each section** and **across the whole post**, shown as "battery — used 6 times".

## Features

- **Section by section.** The text is split at its headings, and each section gets its own list of repeated words.
- **Keeps real headings from Google Docs, WordPress and Word.** Paste straight from the editor and the H1/H2/H3 structure is kept exactly. In plain text, start heading lines with `#`, `##` or `###`.
- **Colour levels.** Green is fine, amber is repetitive, red is overused. You can change the limits for a single section and for the whole blog.
- **Click a word to see every place it is used.** Each place is highlighted and numbered, and you can step through them one by one.
- **Repeated phrases** of 2–3 words (for example "GPS tracker"). Phrases never cross punctuation or line breaks.
- **Word forms (AI).** An English NLP model ([wink-nlp](https://winkjs.org/wink-nlp/)) groups forms of the same word, such as *tracker / trackers / tracker's*, *study / studies / studied* and *run / ran / running*. The spellings it grouped are always listed, so you can see exactly what was merged.
- **Every word is counted.** Common words (the, and, is…), numbers, heading text and words used only once are all counted and listed. Common words and numbers sit in their own groups so they don't drown out real repetition.
- **Self-check.** The results open with a coverage line ("✓ All 1,234 words read, counts add up to 1,234"). It also warns if any letter or digit in the text was not read.
- **All words list.** Every word in the blog, with its total and how often it's used in each section. Includes a search box, and the total row equals the full word count.
- You can still choose to skip common words, numbers, headings, or your own list of words (such as brand names) in Settings.
- Copy a plain-text report. Your text never leaves the browser.

## How counting works

Counts come from a deterministic tokenizer (`lib/tokenize.ts`), not from a model, so the same text always gives the same numbers.

- Matching ignores case: *Tracker* = *tracker*.
- Possessives count toward the word: *tracker's* counts as *tracker* (the spelling is shown). Contractions like *it's* and *let's* stay as they are.
- Hyphenated words are split, so every part is counted: *GPS-enabled* counts as *GPS* + *enabled*. You can turn this off in Settings.
- Contractions are one word: *don't*, *isn't*.
- Prices and decimals stay whole: *$129.99*, *1.5*, *2,000*.
- Curly and straight apostrophes are treated the same. So are accented letters typed in different ways.
- Abbreviations like *U.S.* and *e.g.* stay whole.
- When you paste from Google Docs, WordPress or Word, the headings are taken from the formatting. If that conversion ever produces fewer words than the plain-text copy on the clipboard, the plain text is used instead, so pasting never loses words.

In **Word forms** mode the model only decides *which group* a word belongs to. It never changes how many words are counted. Whenever the model and the tokenizer disagree, the word stays in its exact form. The model also never joins words that look different, such as *best* and *good*.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests, including randomised cross-checks against an independent counter
npm run build
```

## Deploy

This is a standard Next.js app with no environment variables. On Vercel, choose **Add New → Project**, import this GitHub repository and click **Deploy**. Every push to `main` redeploys it.
