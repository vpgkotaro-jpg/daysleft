// Emergency card text. Pure; the same text feeds the screen, the .txt export and the QR code.
import { sortMeds } from './daysleft.js';

const fmtPerDay = m => {
  const n = +m.perDay.toFixed(2);
  return `${n}/day`;
};

export function medLine(m, { short = false } = {}) {
  const parts = [m.name + (m.strength ? ' ' + m.strength : '')];
  parts.push(m.perDay > 0 ? fmtPerDay(m) : 'dose not set');
  if (m.days !== null) parts.push(m.days < 1 ? 'OUT' : `${m.days}d left` + (!short && m.lastCovered ? ` (to ${m.lastCovered})` : ''));
  return parts.join(' | ');
}

/** @param {{meds:any[], card:{name?:string, allergies?:string, contact?:string}}} data */
export function cardText(data, today, lead, { short = false } = {}) {
  const c = data.card || {};
  const meds = sortMeds(data.meds, today, lead);
  const L = [`DaysLeft emergency card (as of ${today})`];
  if (c.name) L.push(`Name: ${c.name}`);
  L.push(`Allergies: ${c.allergies?.trim() || 'none entered'}`);
  L.push(`Emergency contact: ${c.contact?.trim() || 'none entered'}`);
  L.push('Medicines:');
  if (!meds.length) L.push('- none entered');
  for (const m of meds) L.push('- ' + medLine(m, { short }));
  L.push('Typed by the owner; check labels. Not medical advice.');
  return L.join('\n');
}

/** Build a QR (qrcode-generator global) from the compact text; falls back to a shorter text if too long. */
export function buildQr(qrcodeLib, data, today, lead) {
  for (const short of [false, true]) {
    const text = cardText(data, today, lead, { short });
    try {
      const qr = qrcodeLib(0, 'M');
      qr.addData(text, 'Byte');
      qr.make();
      return { qr, text, short };
    } catch (e) { /* too long: try the short form */ }
  }
  return { qr: null, text: cardText(data, today, lead, { short: true }), short: true };
}
