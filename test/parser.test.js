import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabel, matchDrug } from '../js/parser.js';

const L = (...lines) => lines;
const get = (p) => ({
  name: p.name.value, strength: p.strength.value, qty: p.quantity.value,
  dose: p.dose.value, times: p.timesPerDay.value, perDay: p.unitsPerDay.value,
});

// [label, lines, expected subset]
const CASES = [
  ['01 classic BID', L('FICTIONAL PHARMACY', 'METFORMIN HCL 500 MG TABLET', 'TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS', 'QTY: 60'),
    { name: 'Metformin', strength: '500 mg', qty: 60, dose: 1, times: 2, perDay: 2 }],
  ['02 words: one tablet every morning', L('Amlodipine 5 mg tablets', 'Take one tablet by mouth every morning', 'Qty: 90'),
    { name: 'Amlodipine', strength: '5 mg', qty: 90, dose: 1, times: 1, perDay: 1 }],
  ['03 every 8 hours', L('GABAPENTIN 300 MG CAPSULE', 'TAKE 1 CAPSULE BY MOUTH EVERY 8 HOURS', 'QTY: 90'),
    { name: 'Gabapentin', strength: '300 mg', qty: 90, dose: 1, times: 3, perDay: 3 }],
  ['04 TID abbreviation', L('Lisinopril 10mg', 'TAKE 1 TAB PO TID', 'QTY 90'),
    { name: 'Lisinopril', strength: '10 mg', qty: 90, dose: 1, times: 3, perDay: 3 }],
  ['05 QD with 2 tablets', L('ATORVASTATIN 20 MG', 'Take 2 tablets by mouth QD', 'DISP: 60'),
    { name: 'Atorvastatin', strength: '20 mg', qty: 60, dose: 2, times: 1, perDay: 2 }],
  ['06 BID, hash quantity', L('Sertraline 50 mg tablet', 'Take 1 tablet BID', '#60'),
    { name: 'Sertraline', strength: '50 mg', qty: 60, dose: 1, times: 2, perDay: 2 }],
  ['07 four times a day', L('Cephalexin 500 mg capsule', 'Take 1 capsule 4 times a day', 'Quantity: 28'),
    { name: 'Cephalexin', strength: '500 mg', qty: 28, dose: 1, times: 4, perDay: 4 }],
  ['08 QID abbreviation', L('Amoxicillin 250 mg', 'Take 1 capsule QID', 'Qty: 40'),
    { name: 'Amoxicillin', strength: '250 mg', qty: 40, dose: 1, times: 4, perDay: 4 }],
  ['09 q12h', L('Levetiracetam 500 mg', 'Take 1 tablet q12h', 'QTY: 60'),
    { name: 'Levetiracetam', strength: '500 mg', qty: 60, dose: 1, times: 2, perDay: 2 }],
  ['10 every 6 hours', L('Acetaminophen 500 mg', 'Take 2 tablets every 6 hours', 'QTY: 120'),
    { name: 'Acetaminophen', strength: '500 mg', qty: 120, dose: 2, times: 4, perDay: 8 }],
  ['11 half tablet', L('Levothyroxine 50 mcg', 'Take 1/2 tablet daily', 'QTY: 45'),
    { name: 'Levothyroxine', strength: '50 mcg', qty: 45, dose: 0.5, times: 1, perDay: 0.5 }],
  ['12 one-half tablet at bedtime', L('Trazodone 50 mg', 'TAKE ONE-HALF TABLET AT BEDTIME', 'QTY: 15'),
    { name: 'Trazodone', strength: '50 mg', qty: 15, dose: 0.5, times: 1, perDay: 0.5 }],
  ['13 3x daily', L('Prednisone 10 mg', 'Take 1 tablet 3x daily', 'Qty 30'),
    { name: 'Prednisone', strength: '10 mg', qty: 30, dose: 1, times: 3, perDay: 3 }],
  ['14 two times a day', L('Losartan 50 mg', 'Take 1 tablet two times a day', 'QTY: 60'),
    { name: 'Losartan', strength: '50 mg', qty: 60, dose: 1, times: 2, perDay: 2 }],
  ['15 combo strength', L('HYDROCODONE/ACETAMINOPHEN 5/325 MG', 'TAKE 1 TABLET TWICE DAILY', 'QTY: 20'),
    { strength: '5/325 mg', qty: 20, dose: 1, times: 2, perDay: 2 }],
  ['16 once a day, Rx number not a quantity', L('Rx# 1234567', 'Carvedilol 25 mg', 'Take 1 tablet once a day', 'Qty: 30', 'Refills: 5'),
    { name: 'Carvedilol', strength: '25 mg', qty: 30, times: 1, perDay: 1 }],
  ['17 OCR letter O in quantity', L('Metformin 850 mg', 'Take 1 tablet twice daily', 'QTY: 6O'),
    { qty: 60, perDay: 2 }],
  ['18 OCR typo in drug name is fuzzy matched', L('METF0RMIN 500 MG', 'TAKE 1 TABLET TWICE DAILY', 'QTY: 60'),
    { name: 'Metformin', qty: 60 }],
  ['19 every other day', L('Methotrexate 2.5 mg', 'Take 1 tablet every other day', 'QTY: 15'),
    { dose: 1, times: 0.5, perDay: 0.5 }],
  ['20 weekly', L('Alendronate 70 mg', 'Take 1 tablet once a week', 'QTY: 4'),
    { dose: 1, perDay: 1 / 7 }],
  ['21 no take verb: sig style', L('Sig: 1 tab PO BID', 'Famotidine 20 mg', 'Qty: 60'),
    { name: 'Famotidine', dose: 1, times: 2, qty: 60 }],
];

for (const [label, lines, exp] of CASES) {
  test(`extracts: ${label}`, () => {
    const got = get(parseLabel(lines));
    for (const [k, v] of Object.entries(exp)) {
      if (typeof v === 'number') assert.ok(Math.abs(got[k] - v) < 1e-5, `${k}: expected ${v} got ${got[k]}`);
      else assert.equal(got[k], v, k);
    }
  });
}

// Cases where the parser must NOT guess.
const REFUSE = [
  ['R1 as needed (PRN)', L('Ibuprofen 400 mg', 'Take 1 tablet every 6 hours as needed for pain', 'QTY: 30'), 'timesPerDay'],
  ['R2 dose range', L('Lorazepam 0.5 mg', 'Take 1 to 2 tablets twice daily', 'QTY: 30'), 'dose'],
  ['R3 dose range with dash', L('Cetirizine 10 mg', 'TAKE 1-2 TABLETS DAILY', 'QTY: 30'), 'dose'],
  ['R4 frequency range', L('Acetaminophen 500 mg', 'Take 1 tablet every 4 to 6 hours', 'QTY: 60'), 'timesPerDay'],
  ['R5 PRN abbreviation', L('Albuterol 2 mg', 'Take 1 tablet PRN', 'Qty 20'), 'timesPerDay'],
  ['R6 conflicting frequencies', L('Metformin 500 mg', 'Take 1 tablet twice daily', 'or three times daily with meals', 'QTY: 60'), 'timesPerDay'],
  ['R7 no frequency at all', L('Metformin 500 mg', 'Take with meals', 'QTY: 60'), 'timesPerDay'],
  ['R8 morning and night', L('Quetiapine 100 mg', 'Take 1 tablet in the morning and 2 tablets at night', 'QTY: 90'), 'timesPerDay'],
  ['R9 two daily phrases, different times', L('Escitalopram 10 mg', 'Take 1 tablet every morning and 1 every night', 'QTY: 60'), 'timesPerDay'],
  ['R10 conflicting quantities', L('Metformin 500 mg', 'Take 1 tablet twice daily', 'QTY: 60', 'QTY: 30'), 'quantity'],
  ['R11 no quantity on label', L('Metformin 500 mg', 'Take 1 tablet twice daily'), 'quantity'],
  ['R12 gibberish', L('l1l1 ~~ ..', 'xx yy zz'), 'name'],
];
for (const [label, lines, key] of REFUSE) {
  test(`refuses to guess: ${label}`, () => {
    const p = parseLabel(lines);
    assert.equal(p[key].value, null, `${key} should be null, got ${p[key].value}`);
    if (key === 'timesPerDay' || key === 'dose') assert.equal(p.unitsPerDay.value, null);
    assert.ok(p.warnings.length > 0, 'a warning should explain why');
  });
}

test('missing dose phrase is assumed 1 but flagged low confidence', () => {
  const p = parseLabel(L('Metformin 500 mg', 'Twice daily', 'QTY: 60'));
  assert.equal(p.dose.value, 1);
  assert.ok(p.dose.confidence < 0.5);
});

test('every field carries its source text for human review', () => {
  const p = parseLabel(L('METFORMIN HCL 500 MG TABLET', 'TAKE 1 TABLET BY MOUTH TWICE DAILY', 'QTY: 60'));
  assert.match(p.quantity.source.text, /QTY: 60/);
  assert.equal(p.quantity.source.from, 2);
  assert.match(p.timesPerDay.source.text, /TWICE DAILY/i);
  assert.equal(p.name.source.from, 0);
});

test('quantity vs days-supply mismatch raises a warning', () => {
  const p = parseLabel(L('Metformin 500 mg', 'Take 1 tablet twice daily', 'QTY: 60', '15 DAY SUPPLY'));
  assert.ok(p.warnings.some(w => /supply/i.test(w)));
  const ok = parseLabel(L('Metformin 500 mg', 'Take 1 tablet twice daily', 'QTY: 60', '30 DAY SUPPLY'));
  assert.ok(!ok.warnings.some(w => /supply/i.test(w)));
});

test('unknown drug names are kept but flagged low confidence', () => {
  const p = parseLabel(L('ZORBIFLEX 25 MG TABLET', 'TAKE 1 TABLET DAILY', 'QTY: 30'));
  assert.equal(p.name.value, 'Zorbiflex');
  assert.ok(p.name.confidence <= 0.5);
});

test('matchDrug: ambiguous or short words are not matched', () => {
  assert.equal(matchDrug('tablet'), null);
  assert.equal(matchDrug('pill'), null);
  assert.equal(matchDrug('Metformln').name, 'metformin');
});

test('multi-line directions are found across a line break', () => {
  const p = parseLabel(L('Simvastatin 20 mg', 'TAKE 1 TABLET BY MOUTH', 'ONCE DAILY IN THE EVENING', 'QTY: 30'));
  assert.equal(p.timesPerDay.value, 1);
  assert.equal(p.dose.value, 1);
});
