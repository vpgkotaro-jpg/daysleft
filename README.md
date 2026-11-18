# DaysLeft

**Know which medicine runs out first, before an emergency.**
STEM2Connect AI Hackathon 2026, Healthcare track. Live app: https://vpgkotaro-jpg.github.io/daysleft/

## The problem

After the 2024 Noto Peninsula earthquake, a medical team found that 31 of about 300 people at one shelter would run out of oral medicine within 7 days, and nobody knew who until they asked each person (J Nippon Med Sch medical association journal 2024;20(3):156). People who take daily medicine usually do not know their own run-out date, and in a disaster nobody else does either.

## What it does

1. **Scan a pharmacy label on your device.** A photo (or one of 3 built-in SAMPLE labels) is read by OCR in the browser. A parser proposes the drug name, strength, quantity dispensed and dosing frequency.
2. **You confirm every field.** Each field shows a confidence badge and the cropped piece of the photo plus the exact text it was read from. Low or missing fields are outlined. Nothing is saved until you tick "I checked these values against the label". Manual entry (no photo) works too.
3. **Days left.** Units on hand / units per day = days left. The list is sorted with the first medicine to run out on top, under a headline such as "7 days until your first medicine runs out". The refill warning threshold is adjustable. "I took today's dose" and "Fix count" keep the numbers true.
4. **Emergency card.** One screen with medicines, strengths, schedule, days left as of today, allergies and an emergency contact you type. Print stylesheet, `.txt` download, and a QR code that contains the same compact plain text (no link, no server).
5. **Safety and privacy.** It gives no medical advice and checks no interactions. OCR can be wrong. All data stays in `localStorage`; there are no accounts, no analytics and no network calls after the page loads. A "Delete all data" button wipes it.

## How the AI is used

- **Model:** Tesseract's LSTM OCR (`eng`, tessdata_best, int-quantised) running through [tesseract.js](https://github.com/naptha/tesseract.js) as WebAssembly in a web worker. It runs on your device. The worker, wasm core and traineddata are vendored in `vendor/` and served from the same origin: no CDN, no API key, no upload, and it works offline once cached by the service worker.
- **Parser (`js/parser.js`):** rule-based, not a model. It finds name, strength (including `5/325 mg`), quantity (`QTY`, `DISP`, `#60`), dose per take (`1`, `one`, `1/2`, `one-half`) and times per day (`BID`, `TID`, `QID`, `twice daily`, `3x daily`, `every 8 hours`, `q12h`, `every other day`, `weekly`). It fuzzy-matches the name against about 150 common generic names to repair OCR typos (`METF0RMIN` becomes Metformin) and says so when it does. The OCR line confidence is combined with the parser's own confidence for the badge.
- **It refuses to guess.** "As needed" / PRN, dose ranges ("1 to 2 tablets"), frequency ranges ("every 4 to 6 hours"), conflicting frequencies, several times of day ("1 in the morning and 2 at night") and conflicting quantities return no value plus a reason, so the person has to enter the number. A mismatch between quantity / daily use and a printed "N day supply" raises a warning.
- **What it gets wrong:** curved bottles, glare, low resolution and handwriting. In my evaluation the only failure was a low-resolution JPEG where "Qty: 90" was read as "ayo"; the parser correctly reported "not found" instead of inventing a number.

### Measured field-extraction accuracy (real numbers)

`npm run eval` runs the real OCR and the real parser on 12 synthetic images (3 labels x clean, rotated 2.5 degrees on a dark surface, blurred and noisy JPEG, low-resolution JPEG) and compares with `eval/ground_truth.json`. Result (default page-segmentation mode, `eval/results.md`):

| field | correct |
|---|---|
| drug name | 12/12 |
| strength | 12/12 |
| quantity | 11/12 (1 not found, 0 wrong) |
| dose per take | 12/12 |
| times per day | 12/12 |

All five fields right on 11/12 images (92%); units per day right on 12/12. **Read this honestly:** the images are synthetic and clean-ish, only 3 label layouts, and I wrote the parser after designing those layouts, so these numbers are optimistic for real photos of real bottles. I did not test on real labels. That is why the confirm step exists.

## Run it

No build step. Serve the folder with any static server (the service worker and web worker need http, not `file://`):

```
node tools/serve.mjs 8791        # then open http://localhost:8791/
```

## Test

```
node --test                      # 48 tests: 33 parser tests (21 phrasings, 12 must-refuse), days-left math, emergency card text
npm install && npm run eval      # OCR + parser accuracy on eval/images (needs the tesseract.js dev dependency)
NODE_PATH=<dir with playwright> BASE=http://localhost:8791/ node e2e/e2e.cjs   # browser end-to-end
```

The e2e script scans all 3 samples through real OCR, confirms, checks sorting, headline, lead time, "took today", count fix, manual entry, emergency card, QR and `.txt` export, reload persistence, 390 px layout, delete-all, offline reload with OCR, no console errors and no requests to other hosts. `tools/make-samples.cjs` regenerates the images.

## Limitations

- Counts tablets/capsules/units only; it does not know about insulin pens, patches, liquids measured in mL beyond treating them as plain units.
- English labels only. It does not read Japanese labels.
- The first scan downloads about 11 MB of OCR files (cached afterwards).
- Days left assume you take the medicine as written; stale counts are flagged after 3 days.
- English-only drug list; unknown names are kept but marked low confidence.
- Not a medical device. Not medical advice.

## What I learned

- OCR failures cluster on the small, important digits: at low resolution the quantity line was the only thing lost. A wrong number is worse than a missing one, so the parser returns "not found" and the UI makes the person type it.
- `0`/`O` and `1`/`l` swaps inside words and numbers are the most common OCR error. Fixing them only in context (inside a word, or next to `QTY`) avoided turning real numbers into letters.
- Ambiguity is the real parsing problem, not the happy path. 12 of my 33 parser tests are cases where the right answer is "do not guess" (PRN, ranges, conflicts).
- Frequencies need to be matched most-specific-first and blanked out once matched, otherwise "twice daily" also counts as "daily". Repeated phrases ("every morning ... every night") needed their own rule because two equal values would otherwise look consistent.
- Re-rendering a list on `change` swallowed the next button click when the input lost focus (found by the e2e test). The warning threshold now updates on `input`.
- Floating-point: 4 tablets at 1/7 per day must be 28 days, not 27, so values keep 6 decimals and floor with a tiny epsilon.
- Vendoring tesseract.js means shipping the wasm core and the model (about 11 MB); the trade-off is that nothing leaves the device and it works offline.

## AI assistance

Built with help from Claude (Anthropic) as an AI coding assistant; design decisions and testing by the author.

## License

MIT, (c) 2026 Kotaro Kurosaki. Third-party components and credits: see [THIRD_PARTY.md](THIRD_PARTY.md).
