import test from 'node:test';
import assert from 'node:assert/strict';
import { daysLeft, addDays, daysBetween, lastCoveredDate, status, sortMeds, headline, takeToday, unitsPerDay } from '../js/daysleft.js';
import { cardText, medLine } from '../js/emergency.js';

const T = '2026-11-18';
const med = (o) => ({ id: o.name, name: 'X', strength: '', onHand: 60, perDay: 2, countedOn: T, lastTaken: null, ...o });

test('daysLeft floors to whole days', () => {
  assert.equal(daysLeft(60, 2), 30);
  assert.equal(daysLeft(61, 2), 30);
  assert.equal(daysLeft(1, 2), 0);
  assert.equal(daysLeft(10, 0.5), 20);
  assert.equal(daysLeft(3, 1 / 3), 9);
  assert.equal(daysLeft(0, 1), 0);
  assert.equal(daysLeft(5, 0), null);
  assert.equal(daysLeft(-1, 1), null);
});

test('unitsPerDay', () => { assert.equal(unitsPerDay(2, 3), 6); assert.equal(unitsPerDay(0.5, 1), 0.5); });

test('date helpers cross month and year ends', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(daysBetween('2026-11-15', '2026-11-18'), 3);
});

test('lastCoveredDate depends on whether today\'s dose is taken', () => {
  assert.equal(lastCoveredDate(med({ onHand: 4, perDay: 1 }), T), '2026-11-21');
  assert.equal(lastCoveredDate(med({ onHand: 4, perDay: 1, lastTaken: T }), T), '2026-11-22');
  assert.equal(lastCoveredDate(med({ onHand: 0 }), T), null);
});

test('status thresholds follow the lead time', () => {
  assert.equal(status(0, 7), 'out');
  assert.equal(status(7, 7), 'soon');
  assert.equal(status(8, 7), 'ok');
  assert.equal(status(null, 7), 'unknown');
});

test('sortMeds puts the first to run out on top', () => {
  const s = sortMeds([med({ name: 'B', onHand: 60 }), med({ name: 'A', onHand: 8 }), med({ name: 'C', onHand: 20, perDay: 0 })], T, 7);
  assert.deepEqual(s.map(m => m.name), ['A', 'B', 'C']);
  assert.equal(s[0].days, 4);
  assert.equal(s[0].status, 'soon');
});

test('headline names the days until the first medicine runs out', () => {
  const s = sortMeds([med({ name: 'A', onHand: 8 }), med({ name: 'B', onHand: 60 })], T, 7);
  const h = headline(s, 7);
  assert.equal(h.text, '4 days until your first medicine runs out');
  assert.equal(h.level, 'soon');
  assert.equal(headline(sortMeds([med({ name: 'A', onHand: 2, perDay: 1 })], T, 7).map(m => m), 7).text, '2 days until your first medicine runs out');
  assert.match(headline([], 7).text, /Add a medicine/);
  assert.equal(headline(sortMeds([med({ name: 'Z', onHand: 0 })], T, 7), 7).level, 'out');
  assert.match(headline(sortMeds([med({ onHand: 1, perDay: 1 })], T, 7), 7).text, /^1 day until/);
});

test('takeToday subtracts one day once per calendar day', () => {
  const m = takeToday(med({ onHand: 10, perDay: 2 }), T);
  assert.equal(m.onHand, 8);
  assert.equal(takeToday(m, T).onHand, 8);
  assert.equal(takeToday(m, '2026-11-19').onHand, 6);
  assert.equal(takeToday(med({ onHand: 1, perDay: 2 }), T).onHand, 0);
});

test('emergency card text lists medicines sorted with days left and the typed fields', () => {
  const data = { meds: [med({ name: 'Metformin', strength: '500 mg', onHand: 60 }), med({ name: 'Gabapentin', strength: '300 mg', onHand: 9, perDay: 3 })], card: { name: 'Jane Sample', allergies: 'penicillin', contact: 'Sam 555-0100' } };
  const t = cardText(data, T, 7);
  assert.match(t, /as of 2026-11-18/);
  assert.match(t, /Allergies: penicillin/);
  assert.ok(t.indexOf('Gabapentin') < t.indexOf('Metformin'));
  assert.match(t, /Gabapentin 300 mg \| 3\/day \| 3d left \(to 2026-11-20\)/);
  assert.match(medLine({ name: 'Q', strength: '', perDay: 1, days: 0 }), /OUT/);
  assert.match(cardText({ meds: [], card: {} }, T, 7), /none entered/);
});
