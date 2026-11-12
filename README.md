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
- **Word forms (AI), on by default.** An English NLP model ([wink-nlp](https://winkjs.org/wink-nlp/)) reads each word in its sentence and counts forms of the same word together: *track / tracks / tracked / tracking*, *battery / batteries*, *big / bigger / biggest*. The spellings it grouped are always listed. Switch to **Exact spelling** to count each spelling on its own.
- **Close repeats.** Flags a word used again within a few words of its previous use (12 by default), which is the repetition readers notice most. They're underlined in red in the highlighted view.
- **Suggested alternatives.** Click an overused word to see possible replacements from a built-in thesaurus (*buy → purchase*, *use → apply, employ, utilize*). The model's part-of-speech reading picks the right kind of synonym, and words you already use are marked. Only well-attested synonyms are included, so many words have no suggestion.
- **Find (Ctrl+F) reconciliation.** Ctrl+F also matches inside longer words, so its number is often higher than a whole-word count. Click a word and the tool shows where the difference comes from: *"Find for 'track' shows 8 here: 3 counted above, and 5 inside other words: tracker ×4 · trackers ×1"*.
- **Every word is counted.** Common words (the, and, is…), numbers, heading text and words used only once are all counted and listed. Common words and numbers sit in their own groups so they don't drown out real repetition.
- **Self-check.** The results open with a coverage line ("✓ All 1,234 words read, counts add up to 1,234"). It also warns if any letter or digit in the text was not read.
- You can still choose to skip common words, numbers, headings, or your own list of words (such as brand names) in Settings.
- Copy a plain-text report. Your text never leaves the browser.

## How counting works

Counts come from a deterministic tokenizer (`lib/tokenize.ts`), not from a model, so the same text always gives the same numbers.

- Matching ignores case: *Tracker* = *tracker*.
- Possessives count toward the word: *tracker's* counts as *tracker* (the spelling is shown). Contractions like *it's* and *let's* stay as they are.
- Hyphenated words are split, so every part is counted: *GPS-enabled* counts as *GPS* + *enabled*. They stay whole when a part isn't a word on its own: *Wi-Fi*, *e-mail*, *t-shirt*, *co-founder*, *re-enter*, *non-stop*. You can turn splitting off in Settings.
- A web address or e-mail address is one item. It is never broken into *www*, *com* and the words in its path.
- *US*, *IT* and *WHO* in capitals are their own words, separate from *us*, *it* and *who*.
- Contractions are one word: *don't*, *isn't*.
- Prices and decimals stay whole: *$129.99*, *1.5*, *2,000*.
- Curly and straight apostrophes are treated the same. So are accented letters typed in different ways.
- Abbreviations like *U.S.* and *e.g.* stay whole.
- Words in tables, lists and headings are all counted. Each paragraph, list item and table cell is read separately, so repeated phrases never run from one into the next.
- When you paste, the formatted version is checked against the plain-text copy on the clipboard. If the formatted version ever has fewer words, the plain text is used instead, so pasting never loses words.

## How word forms are grouped

In **Word forms** mode the model only decides *which group* a word belongs to. It never changes how many words are counted. The grouping (`lib/wordForms.ts`) works in two steps:

1. **Model vote.** The model tags every occurrence with a part of speech and a dictionary form. All occurrences of one spelling vote, so one spelling never lands in two groups.
2. **Evidence rules.** Forms the model leaves alone ("-ing" nouns like *tracking*, "-ed" adjectives like *trusted*, comparatives like *longer*, plurals of words it doesn't know like *apps*) join a base word only when that base word is itself in the text and is used there as a matching kind of word. An "-ing" word joins a base only if the base is used as a verb: *tracking* joins *we track*, but *parenting* does not join *parents*.

Words that look different are never joined (*best* / *good*, *went* / *go*), and neither are different words that happen to share letters (*evening* / *even*, *news* / *new*, *user* / *use*).

If you disagree with a grouping, click the word and choose **count separately** next to a spelling. It is counted on its own from then on (Settings lists these words).

Accuracy is measured by four benchmarks in `tests/` (316 expectations): hand-written blog sentences, held-out sentences, every form of 120 common verbs, nouns and adjectives, and 60 pairs of look-alike words that must never be grouped. The current grouping meets all of them; the first version met 235 of the first 256. The tests fail if accuracy drops. A benchmark can't cover every sentence in English, which is why groupings are always shown and can be split.

The thesaurus (`public/thesaurus.json`, about 10 KB compressed, loaded on first use) is built from [Princeton WordNet](https://wordnet.princeton.edu/) by `npm run build:thesaurus`. It keeps only each word's dominant meaning and synonyms attested at least five times in that meaning, so rare senses don't produce bad suggestions.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # unit tests, including randomised cross-checks against an independent counter
npm run build
npm run build:thesaurus   # only needed to regenerate public/thesaurus.json
```

## Deploy

This is a standard Next.js app with no environment variables. On Vercel, choose **Add New → Project**, import this GitHub repository and click **Deploy**. Every push to `main` redeploys it.
