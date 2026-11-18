import { parseLabel } from './parser.js';
import { todayISO, daysBetween, sortMeds, headline, takeToday } from './daysleft.js';
import { cardText, buildQr } from './emergency.js';
import { toCanvas, recognize } from './ocr.js';
import * as store from './storage.js';

const $ = id => document.getElementById(id);
let data = store.load();
let scan = null; // {canvas, lines, parsed} while reviewing

const persist = () => { if (!store.save(data)) toast('Could not save: browser storage is blocked.'); };
const today = () => todayISO();
function toast(msg) { const e = $('form-error'); e.textContent = msg; e.hidden = false; }

// ---------- views ----------
const views = ['meds', 'add', 'card', 'about'];
function show(view) {
  for (const v of views) $('view-' + v).hidden = v !== view;
  for (const b of $('tabs').querySelectorAll('button')) {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (view === 'meds') renderMeds();
  if (view === 'card') renderCard();
  window.scrollTo(0, 0);
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view); });
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) show(g.dataset.goto); });

// ---------- medicines ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (Math.round(n * 100) / 100).toString();
const STATUS_LABEL = { ok: 'OK', soon: 'Refill soon', out: 'Out', unknown: 'No daily amount' };

function renderMeds() {
  const lead = data.settings.lead;
  const t = today();
  const sorted = sortMeds(data.meds, t, lead);
  const h = headline(sorted, lead);
  const box = $('headline');
  box.className = 'headline level-' + h.level;
  $('headline-text').textContent = h.text;
  $('headline-sub').textContent = h.med && h.med.days >= 1
    ? `${h.med.name}${h.med.strength ? ' ' + h.med.strength : ''}: covered through ${h.med.lastCovered}.${h.level === 'soon' ? ' Time to arrange a refill.' : ''}`
    : '';
  if (document.activeElement !== $('lead')) $('lead').value = lead;
  $('empty-note').hidden = sorted.length > 0;
  $('medlist').innerHTML = sorted.map(m => {
    const stale = m.lastTaken !== t && daysBetween(m.countedOn, t) >= 3;
    const took = m.lastTaken === t;
    return `<li class="med ${m.status}" data-id="${esc(m.id)}">
      <div class="med-top">
        <div>
          <h3>${esc(m.name)} ${m.strength ? `<small>${esc(m.strength)}</small>` : ''}<span class="chip ${m.status}">${STATUS_LABEL[m.status]}</span></h3>
          <p class="facts">${num(m.onHand)} on hand &middot; ${num(m.perDay)} per day &middot; counted ${esc(m.countedOn)}</p>
        </div>
        <div class="days"><strong>${m.days === null ? '-' : m.days}</strong><span>${m.days === 1 ? 'day left' : 'days left'}</span></div>
      </div>
      <p class="runout">${m.lastCovered ? `Last full day covered: <strong>${m.lastCovered}</strong>` : m.days === 0 ? '<strong>No full day of supply left.</strong>' : ''}</p>
      ${stale ? `<p class="stale">This count is ${daysBetween(m.countedOn, t)} days old. Recount or log your doses so the days left stay true.</p>` : ''}
      <div class="row">
        <button class="btn small primary" data-act="took" ${took ? 'disabled' : ''}>${took ? "Today's dose logged" : "I took today's dose"}</button>
        <button class="btn small" data-act="fix">Fix count</button>
        <button class="btn small danger" data-act="remove">Remove</button>
      </div>
      <form class="fixform" data-fix hidden>
        <label for="fix-${esc(m.id)}">Units on hand now</label>
        <input id="fix-${esc(m.id)}" type="number" min="0" step="any" inputmode="decimal" value="${num(m.onHand)}">
        <button class="btn small primary" type="submit">Save count</button>
        <button class="btn small" type="button" data-act="fixcancel">Cancel</button>
      </form>
    </li>`;
  }).join('');
}

$('medlist').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const li = btn.closest('li');
  const id = li.dataset.id;
  const i = data.meds.findIndex(m => m.id === id);
  if (i < 0) return;
  const act = btn.dataset.act;
  if (act === 'took') { data.meds[i] = takeToday(data.meds[i], today()); persist(); renderMeds(); }
  else if (act === 'remove') { data.meds.splice(i, 1); persist(); renderMeds(); }
  else if (act === 'fix') { li.querySelector('[data-fix]').hidden = false; li.querySelector('[data-fix] input').focus(); }
  else if (act === 'fixcancel') li.querySelector('[data-fix]').hidden = true;
});
$('medlist').addEventListener('submit', e => {
  e.preventDefault();
  const li = e.target.closest('li');
  const v = Number(li.querySelector('[data-fix] input').value);
  if (!(v >= 0) || !Number.isFinite(v)) return;
  const i = data.meds.findIndex(m => m.id === li.dataset.id);
  data.meds[i] = { ...data.meds[i], onHand: v, countedOn: today(), lastTaken: data.meds[i].lastTaken === today() ? today() : null };
  persist(); renderMeds();
});
// 'input' (not 'change'): a blur-triggered re-render would swallow the click on the next button.
$('lead').addEventListener('input', () => {
  const v = Number($('lead').value);
  if (!Number.isInteger(v) || v < 1 || v > 60) return;
  data.settings.lead = v; persist(); renderMeds();
});

// ---------- scan ----------
function setStatus(msg, pct) {
  $('ocr-status').hidden = false;
  $('ocr-msg').textContent = msg;
  if (pct !== undefined) $('ocr-bar').value = pct;
}

const STEP = { 'loading tesseract core': 'Loading the OCR engine (local)...', 'initializing tesseract': 'Starting the OCR engine...', 'loading language traineddata': 'Loading the English model (local)...', 'initializing api': 'Preparing the model...', 'recognizing text': 'Reading the label...' };

async function runScan(source) {
  $('review').hidden = true;
  setStatus('Preparing image...', 0);
  try {
    const canvas = await toCanvas(source);
    const res = await recognize(canvas, m => {
      if (m.status in STEP) setStatus(STEP[m.status] + ' ' + Math.round((m.progress || 0) * 100) + '%', Math.round((m.progress || 0) * 100));
    });
    setStatus(`Done: read ${res.lines.length} lines. Check the fields below.`, 100);
    const parsed = parseLabel(res.lines.map(l => l.text));
    scan = { canvas, lines: res.lines, parsed };
    openReview(scan);
  } catch (err) {
    console.error(err);
    setStatus('Could not read that image (' + (err && err.message ? err.message : 'error') + '). You can enter the medicine by hand.', 0);
  }
}

$('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) runScan(f); e.target.value = ''; });
document.querySelector('.sample-row').addEventListener('click', e => {
  const b = e.target.closest('button[data-sample]'); if (b) runScan(b.dataset.sample);
});
$('manual-btn').addEventListener('click', () => { scan = null; openReview(null); });

// ---------- review form ----------
const FIELDS = { name: 'f-name', strength: 'f-strength', quantity: 'f-onhand', dose: 'f-dose', timesPerDay: 'f-times' };

function confLabel(f, ocrConf) {
  if (f.value === null) return { cls: 'none', text: 'Not found: enter it', pct: 0 };
  const pct = Math.round(100 * f.confidence * (0.5 + 0.5 * (ocrConf ?? 100) / 100));
  return pct >= 75 ? { cls: 'high', text: `High confidence ${pct}%`, pct } : pct >= 55 ? { cls: 'med', text: `Medium confidence ${pct}%`, pct } : { cls: 'low', text: `Low confidence ${pct}%`, pct };
}

function cropFor(f) {
  if (!scan || !f.source) return null;
  const ls = scan.lines.slice(f.source.from, f.source.to + 1);
  if (!ls.length) return null;
  const pad = 8;
  const x0 = Math.max(0, Math.min(...ls.map(l => l.bbox.x0)) - pad);
  const y0 = Math.max(0, Math.min(...ls.map(l => l.bbox.y0)) - pad);
  const x1 = Math.min(scan.canvas.width, Math.max(...ls.map(l => l.bbox.x1)) + pad);
  const y1 = Math.min(scan.canvas.height, Math.max(...ls.map(l => l.bbox.y1)) + pad);
  const c = document.createElement('canvas');
  c.width = Math.max(1, x1 - x0); c.height = Math.max(1, y1 - y0);
  c.getContext('2d').drawImage(scan.canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'Cropped part of the photo this value was read from');
  const ocr = ls.reduce((a, l) => a + l.confidence, 0) / ls.length;
  return { c, ocr };
}

function openReview(s) {
  const form = $('review');
  form.hidden = false;
  $('f-confirm').checked = false;
  $('save-btn').disabled = true;
  $('form-error').hidden = true;
  const warn = $('warnings');
  const imgBox = $('review-image');
  imgBox.innerHTML = '';
  for (const k of Object.keys(FIELDS)) {
    const el = $(FIELDS[k]);
    el.value = '';
    const wrap = el.closest('.field');
    wrap.classList.remove('check-it');
    wrap.querySelector('.meta').innerHTML = '';
  }
  if (!s) {
    $('review-title').textContent = '2. Enter the medicine';
    $('review-hint').textContent = 'Type what is on your label. Nothing is saved until you confirm.';
    warn.hidden = true; imgBox.hidden = true;
    $('f-dose').value = 1; $('f-times').value = 1;
    updateCalc();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  $('review-title').textContent = '2. Check every field';
  $('review-hint').textContent = 'The AI read these from your photo. It can be wrong. Nothing is saved until you confirm.';
  imgBox.hidden = false;
  imgBox.appendChild(s.canvas);
  const p = s.parsed;
  const vals = { name: p.name, strength: p.strength, quantity: p.quantity, dose: p.dose, timesPerDay: p.timesPerDay };
  for (const [k, f] of Object.entries(vals)) {
    const el = $(FIELDS[k]);
    el.value = f.value === null ? '' : f.value;
    const wrap = el.closest('.field');
    const crop = cropFor(f);
    const cl = confLabel(f, crop ? crop.ocr : null);
    if (k === 'strength' && f.value === null) { cl.cls = 'none'; cl.text = 'Not found (optional)'; }
    if (f.value === null ? k !== 'strength' : cl.pct < 60) wrap.classList.add('check-it');
    const meta = wrap.querySelector('.meta');
    meta.innerHTML = `<span class="badge ${cl.cls}">${esc(cl.text)}</span>${f.note ? esc(f.note) : ''}`;
    if (crop && f.source) {
      const d = document.createElement('div'); d.className = 'src';
      d.appendChild(crop.c);
      const code = document.createElement('code'); code.textContent = 'Read: "' + f.source.text + '"';
      d.appendChild(code); meta.appendChild(d);
    }
  }
  const w = p.warnings.filter(x => !x.startsWith('strength:'));
  warn.hidden = w.length === 0;
  warn.innerHTML = w.map(x => `<li>${esc(x)}</li>`).join('');
  updateCalc();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateCalc() {
  const onHand = Number($('f-onhand').value), dose = Number($('f-dose').value), times = Number($('f-times').value);
  const perDay = dose * times;
  const el = $('preview-calc');
  if ($('f-onhand').value !== '' && perDay > 0 && onHand >= 0) {
    el.textContent = `${num(perDay)} per day, so ${Math.floor(onHand / perDay + 1e-9)} days of supply.`;
  } else el.textContent = '';
}
for (const id of ['f-onhand', 'f-dose', 'f-times']) $(id).addEventListener('input', updateCalc);
$('f-confirm').addEventListener('change', e => { $('save-btn').disabled = !e.target.checked; });
$('cancel-btn').addEventListener('click', () => { $('review').hidden = true; scan = null; });

$('review').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('f-name').value.trim();
  const onHand = Number($('f-onhand').value), dose = Number($('f-dose').value), times = Number($('f-times').value);
  const err = !name ? 'Enter the medicine name.'
    : ($('f-onhand').value === '' || !(onHand >= 0)) ? 'Enter how many units you have now.'
    : !(dose > 0 && times > 0) ? 'Enter units per dose and doses per day (both above 0).' : '';
  if (err) { toast(err); return; }
  if (!$('f-confirm').checked) { toast('Please tick the box to confirm you checked the label.'); return; }
  const t = today();
  data.meds.push({
    id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, strength: $('f-strength').value.trim(), onHand, dose, times, perDay: +(dose * times).toFixed(6),
    countedOn: t, lastTaken: null, added: t, via: scan ? 'scan' : 'manual',
  });
  persist();
  scan = null;
  $('review').hidden = true;
  $('ocr-status').hidden = true;
  show('meds');
});

// ---------- emergency card ----------
let lastCard = '';
function renderCard() {
  const c = data.card;
  $('c-name').value = c.name; $('c-allergies').value = c.allergies; $('c-contact').value = c.contact;
  drawCard();
}
function drawCard() {
  const t = today(), lead = data.settings.lead;
  lastCard = cardText(data, t, lead);
  const { qr, text, short } = buildQr(window.qrcode, data, t, lead);
  $('card-text').textContent = lastCard;
  const box = $('qr');
  if (qr) {
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const svg = box.querySelector('svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code containing the emergency card text');
    $('qr-note').textContent = short ? 'The QR holds a shortened version (no run-out dates) because the full card was too long. Scan it with any camera app: it is plain text.' : 'Scan with any camera app: the QR is plain text, no link and no server.';
  } else {
    box.innerHTML = ''; $('qr-note').textContent = 'Too many medicines for one QR code. Use the .txt file or print the card.';
  }
}
for (const [id, key] of [['c-name', 'name'], ['c-allergies', 'allergies'], ['c-contact', 'contact']]) {
  $(id).addEventListener('input', e => { data.card[key] = e.target.value; persist(); drawCard(); });
}
$('print-btn').addEventListener('click', () => window.print());
$('txt-btn').addEventListener('click', () => {
  const blob = new Blob([lastCard + '\n'], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `daysleft-emergency-card-${today()}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- delete all ----------
$('wipe-btn').addEventListener('click', () => { $('wipe-row').hidden = true; $('wipe-confirm').hidden = false; $('wipe-yes').focus(); });
$('wipe-no').addEventListener('click', () => { $('wipe-confirm').hidden = true; $('wipe-row').hidden = false; });
$('wipe-yes').addEventListener('click', () => {
  data = store.wipe(); scan = null;
  $('wipe-confirm').hidden = true; $('wipe-row').hidden = false; $('wipe-done').hidden = false;
  $('review').hidden = true; $('ocr-status').hidden = true;
});

// ---------- offline support ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

show('meds');
