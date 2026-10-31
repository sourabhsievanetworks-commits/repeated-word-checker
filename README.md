# Repeated Word Checker

Paste a blog post and see which words and phrases you repeat, both **in each section** and **across the whole post**, shown as "battery — used 6 times".

- **Introduction** = the H1 title and the text under it, up to the first H2.
- **One section per H2.** H3–H6 sub-headings are counted inside their H2 section.

## Features

- **Document editor like Google Docs.** Paste from Google Docs, WordPress, Word or a web page, and the headings (H1–H6, labelled in the margin), lists, tables and bold/italic are kept. A style menu (Normal text, Heading 1–6) and list buttons let you fix or add headings. No `#` symbols are needed.
- **Section by section.** You get the Introduction and then each H2, each with its own list of repeated words.
- **Table view.** Every word is a row, with a column for the Introduction and for each H2, plus the total. You can show repeated words only or all words, and switch between words and phrases. The footer checks that each column adds up to that section's word count. Copy it straight into Google Sheets or Excel.
- **Colour levels.** Green is fine, amber is repetitive, red is overused. You can change the limits for a single section and for the whole blog.
- **Click a word to see every place it is used.** Each place is highlighted and numbered, and you can step through them one by one.
- **Repeated phrases** of 2–3 words (for example "GPS tracker"). Phrases never cross punctuation or line breaks.
- **Word forms (AI).** An English NLP model ([wink-nlp](https://winkjs.org/wink-nlp/)) groups forms of the same word, such as *tracker / trackers / tracker's*, *study / studies / studied* and *run / ran / running*. The spellings it grouped are always listed, so you can see exactly what was merged.
- **Every word is counted.** Common words (the, and, is…), numbers, heading text and words used only once are all counted and listed. Common words and numbers sit in their own groups so they don't drown out real repetition.
- **Self-check.** The results open with a coverage line ("✓ All 1,234 words read, counts add up to 1,234"). It also warns if any letter or digit in the text was not read.
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
- Words in tables, lists and headings are all counted. Each paragraph, list item and table cell is read separately, so repeated phrases never run from one into the next.
- When you paste, the formatted version is checked against the plain-text copy on the clipboard. If the formatted version ever has fewer words, the plain text is used instead, so pasting never loses words.

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
