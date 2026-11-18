// Label parser: turns OCR text from a pharmacy label into candidate fields.
// Pure functions, no DOM, runs in the browser and in Node (ES module).
//
// Design rule: when the text is ambiguous (ranges, "as needed", conflicting
// frequencies, several quantities...) the field is returned with value = null
// and a warning. We would rather ask the user than guess about medicine.

export const DRUGS = `metformin lisinopril atorvastatin amlodipine levothyroxine losartan simvastatin omeprazole
gabapentin hydrochlorothiazide sertraline metoprolol furosemide pantoprazole escitalopram citalopram fluoxetine bupropion
trazodone tramadol prednisone montelukast rosuvastatin pravastatin clopidogrel warfarin apixaban rivaroxaban carvedilol
atenolol propranolol bisoprolol valsartan olmesartan telmisartan irbesartan glipizide glimepiride sitagliptin pioglitazone
levetiracetam lamotrigine carbamazepine topiramate phenytoin risperidone quetiapine olanzapine aripiprazole lithium
alprazolam lorazepam clonazepam diazepam zolpidem amoxicillin azithromycin ciprofloxacin doxycycline cephalexin
sulfamethoxazole metronidazole fluconazole acyclovir valacyclovir oseltamivir ibuprofen naproxen acetaminophen aspirin
meloxicam cyclobenzaprine baclofen tizanidine methocarbamol allopurinol colchicine famotidine ondansetron loratadine
cetirizine fexofenadine albuterol tamsulosin finasteride sildenafil tadalafil estradiol alendronate spironolactone
diltiazem verapamil nifedipine hydralazine clonidine doxazosin digoxin amiodarone isosorbide nitroglycerin ezetimibe
fenofibrate methotrexate hydroxychloroquine tacrolimus mycophenolate azathioprine prednisolone dexamethasone
methylprednisolone hydrocortisone liothyronine methimazole donepezil memantine pramipexole ropinirole carbidopa
sumatriptan oxycodone hydrocodone morphine codeine buprenorphine naltrexone methylphenidate atomoxetine mirtazapine
venlafaxine duloxetine paroxetine amitriptyline nortriptyline buspirone hydroxyzine promethazine loperamide
lacosamide oxcarbazepine zonisamide clobazam primidone phenobarbital sodium-valproate valproate`.split(/\s+/);

const FORM_WORDS = /^(tablets?|tabs?|capsules?|caps?|pills?|solution|suspension|oral|film|coated|er|xr|sr|dr|hcl|usp|chewable)$/i;
const SKIP_LINE = /^\s*(rx\b|patient|name\b|dr\.?\s|doctor|prescriber|pharmacy|phone|tel\b|address|date|filled|discard|refills?|qty|quantity|ndc|warning|caution|store|sample|fictional|not\s+real|for\s+demo|take\b|directions?|sig\b)/i;

const NUMWORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, 'one half': 0.5, 'one-half': 0.5 };
const UNIT_RE = '(?:tablets?|tabs?|capsules?|caps?|pills?|puffs?|drops?|patch(?:es)?|ml|softgels?|lozenges?|units?)';
const NUM_RE = '(\\d+(?:\\.\\d+)?\\s*/\\s*\\d+|\\d+(?:\\.\\d+)?|one[- ]half|one|two|three|four|five|six|half|an?|[lI])';

function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Returns {name, dist} for the closest known generic, or null if none / ambiguous.
export function matchDrug(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 5) return null;
  let best = null, tie = false;
  for (const d of DRUGS) {
    const dist = lev(w, d);
    const max = d.length >= 9 ? 2 : 1;
    if (dist > max) continue;
    if (dist > 0 && w[0] !== d[0]) continue;
    if (!best || dist < best.dist) { best = { name: d, dist }; tie = false; }
    else if (dist === best.dist) tie = true;
  }
  return best && !tie ? best : null;
}

const titleCase = s => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const field = (value, confidence, src = null, note = '') => ({ value, confidence, source: src, note });
const empty = (note = '') => field(null, 0, null, note);

function toNumber(tok) {
  const t = tok.toLowerCase().trim();
  if (t in NUMWORDS) return NUMWORDS[t];
  if (/^[lI]$/.test(tok)) return 1;
  const frac = t.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function lineRange(text, start, end) {
  const before = text.slice(0, start).split('\n').length - 1;
  const upto = text.slice(0, end).split('\n').length - 1;
  return { from: before, to: upto };
}

function src(text, m, offset = 0) {
  const start = m.index + offset;
  const end = start + m[0].length;
  return { text: m[0].trim(), start, end, ...lineRange(text, start, end) };
}

// ---------- name + strength ----------
const STRENGTH_RE = /(\d{1,4}(?:[.,]\d{1,3})?)\s?(mg|mcg|µg|ug|g|ml|iu|units?|%)(?![a-z])/gi;
const COMBO_RE = /(\d{1,4}(?:\.\d+)?)\s?[\/-]\s?(\d{1,4}(?:\.\d+)?)\s?(mg|mcg)(?![a-z])/i;

function normUnit(u) {
  u = u.toLowerCase();
  if (u === 'ml') return 'mL';
  if (u === 'iu') return 'IU';
  if (u === 'µg' || u === 'ug') return 'mcg';
  if (u.startsWith('unit')) return 'units';
  return u;
}

function findStrength(text, lines, offsets, nameLine) {
  const cands = [];
  lines.forEach((ln, i) => {
    if (/\b(take|inject|apply|use|give|chew|inhale)\b/i.test(ln)) return; // dose, not strength
    if (/^\s*(qty|quantity|disp|ndc|rx\b|refills?)/i.test(ln)) return;
    const combo = ln.match(COMBO_RE);
    if (combo) {
      cands.push({ i, val: `${combo[1]}/${combo[2]} ${normUnit(combo[3])}`, m: combo, conf: 0.8 });
      return;
    }
    for (const m of ln.matchAll(STRENGTH_RE)) {
      cands.push({ i, val: `${m[1].replace(',', '.')} ${normUnit(m[2])}`, m, conf: 0.85 });
    }
  });
  if (!cands.length) return empty('No strength found');
  // prefer the name line, then earliest
  cands.sort((a, b) => (a.i === nameLine ? -1 : 0) - (b.i === nameLine ? -1 : 0) || a.i - b.i);
  const first = cands[0];
  const distinct = new Set(cands.map(c => c.val));
  const f = field(first.val, first.i === nameLine ? first.conf : first.conf - 0.1,
    src(text, first.m, offsets[first.i]));
  if (distinct.size > 1) {
    f.confidence = 0.45;
    f.note = `Several strengths seen (${[...distinct].join(', ')}); check which is the tablet strength`;
  }
  return f;
}

function findName(text, lines, offsets) {
  // 1) a line "<WORDS> <strength>" near the top
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (SKIP_LINE.test(ln)) continue;
    const sm = ln.match(/\d{1,4}(?:[.,]\d{1,3})?\s?(?:mg|mcg|µg|ug|g|ml|iu|units?|%)(?![a-z])/i);
    if (!sm) continue;
    const words = fixLetters(ln).slice(0, sm.index).match(/[A-Za-z][A-Za-z-]{2,}/g) || [];
    if (!words.length) continue;
    return pickName(text, words, i, lines, offsets, 'strength-line');
  }
  // 2) any line containing a known drug word
  for (let i = 0; i < lines.length; i++) {
    if (SKIP_LINE.test(lines[i])) continue;
    const words = fixLetters(lines[i]).match(/[A-Za-z][A-Za-z-]{4,}/g) || [];
    for (const w of words) {
      const hit = matchDrug(w);
      if (hit) return pickName(text, [w], i, lines, offsets, 'known-word');
    }
  }
  // 3) labelled
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\b(?:drug|medication|medicine)\s*[:\-]\s*([A-Za-z][A-Za-z -]{2,})/i);
    if (m) return field(titleCase(m[1].trim().split(/\s+/)[0]), 0.5, src(text, m, offsets[i]), 'From a labelled line; not a known drug name');
  }
  return empty('No drug name found');
}

// OCR often reads O as 0 and l/I as 1 inside words ("METF0RMIN"). Same length, so offsets still line up.
const fixLetters = ln => ln.replace(/(?<=[A-Za-z])0(?=[A-Za-z])/g, 'O').replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, 'l');

function pickName(text, words, i, lines, offsets, how) {
  const clean = words.filter(w => !FORM_WORDS.test(w));
  const pool = clean.length ? clean : words;
  for (const w of pool) {
    const hit = matchDrug(w);
    if (hit) {
      const idx = fixLetters(lines[i]).toLowerCase().indexOf(w.toLowerCase());
      const m = { index: idx, 0: w };
      const exact = hit.dist === 0;
      return field(titleCase(hit.name), exact ? 0.92 : 0.7, src(text, m, offsets[i]),
        exact ? '' : `OCR read "${w}"; matched to the closest known drug "${hit.name}" - check spelling`);
    }
  }
  // unknown word: first plausible word, low confidence
  const w = pool[0];
  const idx = lines[i].indexOf(w);
  return field(titleCase(w), how === 'strength-line' ? 0.5 : 0.4, src(text, { index: idx, 0: w }, offsets[i]),
    'Not in the built-in list of common drugs - check spelling against the label');
}

// ---------- quantity ----------
const OCRDIG = { O: '0', o: '0', I: '1', l: '1' };
function findQuantity(text, lines, offsets) {
  const found = [];
  const re = /(?:\b(?:qty|quantity|qnty|dispense[d]?|disp)\b\s*[:.\-]?\s*#?\s*|(?<![A-Za-z0-9])#\s*)([0-9OoIl]{1,4})(?![0-9A-Za-z])/gi;
  lines.forEach((ln, i) => {
    if (/^\s*(rx|ndc)\b/i.test(ln)) return;
    for (const m of ln.matchAll(re)) {
      const raw = m[1];
      if (!/\d/.test(raw)) continue;
      const mapped = raw.replace(/[OoIl]/g, c => OCRDIG[c]);
      const n = Number(mapped);
      if (!Number.isInteger(n) || n < 1) continue;
      found.push({ n, fixed: mapped !== raw, m, i });
    }
  });
  if (!found.length) return empty('No quantity found');
  const vals = new Set(found.map(f => f.n));
  const f0 = found[0];
  if (vals.size > 1) return { ...empty(`Conflicting quantities (${[...vals].join(', ')}); enter it yourself`), source: src(text, f0.m, offsets[f0.i]) };
  return field(f0.n, f0.fixed ? 0.6 : 0.9, src(text, f0.m, offsets[f0.i]),
    f0.fixed ? 'OCR letter read as a digit; check the number' : '');
}

function findDaysSupply(text) {
  const m = text.match(/(\d{1,3})\s*[- ]?\s*day\s*supply/i);
  return m ? Number(m[1]) : null;
}

// ---------- dose per take ----------
function findDose(text) {
  const verb = new RegExp(`\\b(?:take|takes|use|give|chew|inhale|insert|inject|place)\\s+(?:by\\s+mouth\\s+)?${NUM_RE}(?:\\s*(?:to|or|-)\\s*${NUM_RE})?\\s*(?:\\(\\d+\\)\\s*)?(${UNIT_RE})\\b`, 'i');
  const loose = new RegExp(`(?<![#\\w])${NUM_RE}(?:\\s*(?:to|or|-)\\s*${NUM_RE})?\\s*(${UNIT_RE})\\b\\s*(?:by\\s+mouth|po|orally)`, 'i');
  let m = text.match(verb);
  let conf = 0.9;
  if (!m) { m = text.match(loose); conf = 0.7; }
  if (!m) return { f: field(1, 0.35, null, 'No "take N tablets" found; assumed 1 per dose - check the label'), unit: 'unit' };
  const unit = m[3].toLowerCase().replace(/s$/, '');
  if (m[2] !== undefined) {
    return { f: { ...empty('Dose is a range ("1 to 2"); enter your usual dose'), source: src(text, m) }, unit };
  }
  const n = toNumber(m[1]);
  if (n === null || n <= 0 || n > 20) return { f: { ...empty('Could not read the dose'), source: src(text, m) }, unit };
  if (/^[lI]$/.test(m[1])) conf = 0.6;
  return { f: field(n, conf, src(text, m), /^[lI]$/.test(m[1]) ? 'OCR letter read as 1; check' : ''), unit };
}

// ---------- times per day ----------
function findTimesPerDay(text) {
  let rest = text;
  const hits = [];
  const blank = m => ' '.repeat(m[0].length);
  const rules = [
    // as-needed first: we refuse to estimate
    { re: /\b(as needed|prn|when needed|if needed|as directed|as required)\b/i, kind: 'prn' },
    { re: /\bevery\s+(\d{1,2})\s*(?:to|-|or)\s*(\d{1,2})\s*(?:hours?|hrs?|h)\b/i, kind: 'range' },
    { re: /\bq\s*(\d{1,2})\s*-\s*(\d{1,2})\s*h(?:rs?)?\b/i, kind: 'range' },
    { re: /\bevery\s+(\d{1,2})\s*(?:hours?|hrs?|h)\b/i, kind: 'hours' },
    { re: /\bq\s*(\d{1,2})\s*h(?:rs?)?\b/i, kind: 'hours' },
    { re: /\bevery\s+other\s+day\b|\bq\.?o\.?d\b/i, kind: 'val', v: 0.5, c: 0.85 },
    { re: /\bevery\s+(\d{1,2})\s*days\b/i, kind: 'days' },
    { re: /\b(?:once\s+(?:a|per|each)\s+week|weekly|every\s+week)\b/i, kind: 'val', v: 1 / 7, c: 0.85 },
    { re: /\b(?:four\s+times|4\s*(?:x|times))\s*(?:a|per|each|\/)?\s*(?:day|daily|d)?\b|\bq\.?i\.?d\b|\bfour\s+times\s+daily\b/i, kind: 'val', v: 4, c: 0.9 },
    { re: /\b(?:three\s+times|3\s*(?:x|times))\s*(?:a|per|each|\/)?\s*(?:day|daily|d)?\b|\bt\.?i\.?d\b/i, kind: 'val', v: 3, c: 0.9 },
    { re: /\b(?:twice|two\s+times|2\s*(?:x|times))\s*(?:a|per|each|\/)?\s*(?:day|daily|d)?\b|\bb\.?i\.?d\b/i, kind: 'val', v: 2, c: 0.9 },
    { re: /\b(?:once\s+(?:a|per|each)\s+day|once\s+daily|one\s+time\s+(?:a\s+)?(?:day|daily)|1\s*(?:x|time)\s*(?:a|per|\/)?\s*(?:day|daily|d)|q\.?d\b|daily|every\s+day|each\s+day|nightly|every\s+(?:morning|evening|night)|at\s+bedtime|qam|qpm|qhs)/i, kind: 'val', v: 1, c: 0.85 },
  ];
  const warnings = [];
  let prn = null;
  for (const r0 of rules) for (let guard = 0; guard < 4; guard++) {
    const r = r0;
    const m = rest.match(r.re);
    if (!m) break;
    rest = rest.slice(0, m.index) + blank(m) + rest.slice(m.index + m[0].length);
    if (r.kind === 'prn') { prn = m; continue; }
    if (r.kind === 'range') { hits.push({ range: true, m }); continue; }
    if (r.kind === 'hours') {
      const n = Number(m[1]);
      if (n < 1 || n > 24) { hits.push({ bad: true, m }); continue; }
      hits.push({ v: 24 / n, c: Number.isInteger(24 / n) ? 0.9 : 0.65, m });
    } else if (r.kind === 'days') {
      const n = Number(m[1]);
      if (n < 2) { hits.push({ bad: true, m }); continue; }
      hits.push({ v: 1 / n, c: 0.8, m });
    } else hits.push({ v: r.v, c: r.c, m });
  }
  if (prn) {
    const f = { ...empty('"As needed" use: days left cannot be estimated; enter your typical use yourself'), source: src(text, prn) };
    return f;
  }
  if (hits.some(h => h.range)) {
    const h = hits.find(h => h.range);
    return { ...empty('Frequency is a range ("every 4 to 6 hours"); enter your usual number'), source: src(text, h.m) };
  }
  if (hits.some(h => h.bad)) return { ...empty('Could not read the frequency'), source: src(text, hits.find(h => h.bad).m) };
  if (!hits.length) {
    // several times of day without a clear count => refuse
    const parts = new Set((text.toLowerCase().match(/\b(morning|noon|afternoon|evening|night|bedtime)\b/g) || []));
    if (parts.size >= 2) return empty('Several times of day mentioned (doses may differ); enter it yourself');
    return empty('No dosing frequency found');
  }
  const dayParts = hits.filter(h => /morning|evening|night|bedtime|qam|qpm|qhs/i.test(h.m[0]));
  if (dayParts.length > 1) return { ...empty('Several times of day mentioned (doses may differ); enter it yourself'), source: src(text, dayParts[0].m) };
  const vals = new Set(hits.map(h => h.v.toFixed(6)));
  if (vals.size > 1) {
    return { ...empty(`Conflicting frequencies on the label (${hits.map(h => h.m[0].trim()).join(' / ')})`), source: src(text, hits[0].m) };
  }
  const h = hits[0];
  return field(h.v, h.c, src(text, h.m));
}

/**
 * @param {string|string[]} input OCR text, or an array of OCR lines.
 */
export function parseLabel(input) {
  const lines = (Array.isArray(input) ? input : String(input).split(/\r?\n/))
    .map(l => l.replace(/[‘’]/g, "'").replace(/[ \t]+/g, ' ').trimEnd());
  const text = lines.join('\n');
  const offsets = [];
  let o = 0;
  for (const l of lines) { offsets.push(o); o += l.length + 1; }

  const name = findName(text, lines, offsets);
  const nameLine = name.source ? name.source.from : -1;
  const strength = findStrength(text, lines, offsets, nameLine);
  const quantity = findQuantity(text, lines, offsets);
  const { f: dose, unit } = findDose(text);
  const timesPerDay = findTimesPerDay(text);

  const perDayVal = dose.value !== null && timesPerDay.value !== null ? +(dose.value * timesPerDay.value).toFixed(6) : null;
  const unitsPerDay = field(perDayVal, perDayVal === null ? 0 : Math.min(dose.confidence, timesPerDay.confidence));

  const warnings = [];
  for (const [k, f] of Object.entries({ name, strength, quantity, dose, timesPerDay })) {
    if (f.value === null) warnings.push(`${k}: ${f.note}`);
  }
  const daysSupply = findDaysSupply(text);
  if (daysSupply && perDayVal && quantity.value) {
    const implied = quantity.value / perDayVal;
    if (Math.abs(implied - daysSupply) / daysSupply > 0.1)
      warnings.push(`The label says a ${daysSupply}-day supply but quantity / daily use gives about ${Math.round(implied)} days. One of the numbers is probably wrong.`);
  }
  return { name, strength, quantity, dose, timesPerDay, unitsPerDay, unit, daysSupply, warnings, text };
}
