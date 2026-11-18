// Field-extraction evaluation: real OCR (tesseract.js, same eng model file as the web app) + the real parser,
// on the synthetic label images in eval/images (3 labels x 4 conditions: clean, rotated, noisy, low-res).
// Run: npm run eval          (writes eval/results.json and eval/results.md)
import { createWorker } from 'tesseract.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabel } from '../js/parser.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const truth = JSON.parse(fs.readFileSync(path.join(root, 'eval/ground_truth.json'), 'utf8'));
const files = fs.readdirSync(path.join(root, 'eval/images')).filter(f => /\.(png|jpg)$/.test(f)).sort();
const psm = process.env.PSM || '3';

const worker = await createWorker('eng', 1, { langPath: path.join(root, 'vendor/tesseract/lang'), gzip: true, cacheMethod: 'none' });
if (psm !== '3') await worker.setParameters({ tessedit_pageseg_mode: psm });

const keys = ['name', 'strength', 'quantity', 'dose', 'timesPerDay'];
const tally = Object.fromEntries(keys.map(k => [k, { ok: 0, wrongValue: 0, notFound: 0 }]));
const byCond = {};
const rows = [];
let allOk = 0, perDayOk = 0, cleanOnlyConfident = { shown: 0, wrongShownHigh: 0 };

for (const f of files) {
  const [id, condExt] = f.split('_'); const cond = condExt.split('.')[0];
  const { data } = await worker.recognize(path.join(root, 'eval/images', f));
  const lines = data.lines.map(l => l.text.replace(/\s+$/, '')).filter(t => t.trim());
  const p = parseLabel(lines);
  const t = truth[id];
  const got = { name: p.name.value, strength: p.strength.value, quantity: p.quantity.value, dose: p.dose.value, timesPerDay: p.timesPerDay.value };
  let all = true;
  const detail = {};
  for (const k of keys) {
    const ok = got[k] === t[k];
    detail[k] = ok ? 'ok' : got[k] === null ? 'not found' : `WRONG (${got[k]})`;
    if (ok) tally[k].ok++; else { all = false; got[k] === null ? tally[k].notFound++ : tally[k].wrongValue++; }
  }
  const pd = p.unitsPerDay.value === t.dose * t.timesPerDay;
  if (all) allOk++;
  if (pd) perDayOk++;
  (byCond[cond] ||= { n: 0, all: 0 }).n++;
  if (all) byCond[cond].all++;
  rows.push({ file: f, ocrConfidence: Math.round(data.confidence), all, detail, lines });
}
await worker.terminate();

const n = files.length;
const pct = (a, b) => `${a}/${b} (${Math.round(100 * a / b)}%)`;
const out = [];
out.push(`# Field-extraction eval (PSM ${psm}, ${n} images)`, '', '| field | correct | wrong value | not found |', '|---|---|---|---|');
for (const k of keys) out.push(`| ${k} | ${pct(tally[k].ok, n)} | ${tally[k].wrongValue} | ${tally[k].notFound} |`);
out.push('', `All five fields correct on an image: ${pct(allOk, n)}`, `Units per day correct: ${pct(perDayOk, n)}`, '', '| condition | all fields correct |', '|---|---|');
for (const [c, v] of Object.entries(byCond)) out.push(`| ${c} | ${pct(v.all, v.n)} |`);
out.push('', '## Per image', '', '| image | OCR conf | name | strength | quantity | dose | times/day |', '|---|---|---|---|---|---|---|');
for (const r of rows) out.push(`| ${r.file} | ${r.ocrConfidence} | ${keys.map(k => r.detail[k]).join(' | ')} |`);
console.log(out.join('\n'));
fs.writeFileSync(path.join(root, 'eval/results.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(root, 'eval/results.json'), JSON.stringify({ psm, n, tally, allOk, perDayOk, byCond, rows }, null, 2));
