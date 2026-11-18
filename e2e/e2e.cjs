// End-to-end check with Playwright (Chromium). Not needed to use the app.
// Usage: NODE_PATH=<dir with playwright> BASE=http://localhost:8765/ node e2e/e2e.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:8765/';
const step = s => console.log('ok -', s);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const external = [];
  page.on('request', r => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1', new URL(BASE).hostname].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url()); });

  await page.goto(BASE);
  assert.match(await page.textContent('#headline-text'), /Add a medicine/);
  step('empty state');

  const scanSample = async n => {
    await page.click('#tabs [data-view=add]');
    await page.click(`[data-sample$="label${n}.png"]`);
    await page.waitForSelector('#review:not([hidden])', { timeout: 120000 });
  };
  const confirm = async () => { await page.check('#f-confirm'); await page.click('#save-btn'); await page.waitForSelector('#view-meds:not([hidden])'); };

  // 1: Metformin
  await scanSample(1);
  assert.equal(await page.inputValue('#f-name'), 'Metformin');
  assert.equal(await page.inputValue('#f-strength'), '500 mg');
  assert.equal(await page.inputValue('#f-onhand'), '60');
  assert.equal(await page.inputValue('#f-dose'), '1');
  assert.equal(await page.inputValue('#f-times'), '2');
  assert.ok(await page.locator('#review .src canvas').count() >= 3, 'cropped source images shown');
  assert.ok(await page.locator('#save-btn').isDisabled(), 'save disabled until confirmed');
  step('sample 1 OCR + parse + crops; save locked until confirmed');
  await confirm();
  // 3: Gabapentin, corrected count to 21 (3/day -> 7 days)
  await scanSample(3);
  assert.equal(await page.inputValue('#f-name'), 'Gabapentin');
  await page.fill('#f-onhand', '21');
  await confirm();
  // 2: Amlodipine manual count correction later
  await scanSample(2);
  assert.equal(await page.inputValue('#f-name'), 'Amlodipine');
  await confirm();
  step('3 labels saved');

  const names = await page.locator('#medlist h3').evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
  assert.deepEqual(names, ['Gabapentin', 'Metformin', 'Amlodipine'], 'sorted by days left (7, 30, 90)');
  assert.match(await page.textContent('#headline-text'), /^7 days until your first medicine runs out/);
  assert.ok((await page.getAttribute('#headline', 'class')).includes('level-soon'));
  step('list sorted, headline = 7 days, warns at lead 7');

  await page.fill('#lead', '3');
  assert.ok((await page.getAttribute('#headline', 'class')).includes('level-ok'));
  step('lead time adjustable');

  assert.ok(await page.locator('li [data-fix]').first().isHidden(), 'fix form hidden by default');
  await page.click('li:has-text("Gabapentin") [data-act=took]');
  assert.match(await page.textContent('li:has-text("Gabapentin") .days'), /^6\s*days left/);
  assert.ok(await page.locator('li:has-text("Gabapentin") [data-act=took]').isDisabled());
  await page.click('li:has-text("Gabapentin") [data-act=fix]');
  await page.fill('li:has-text("Gabapentin") [data-fix] input', '9');
  await page.press('li:has-text("Gabapentin") [data-fix] input', 'Enter');
  assert.match(await page.textContent('li:has-text("Gabapentin") .days'), /^3\s*days left/);
  step('took today / fix count');

  // manual entry
  await page.click('#tabs [data-view=add]');
  await page.click('#manual-btn');
  await page.fill('#f-name', 'Lisinopril'); await page.fill('#f-onhand', '10');
  await page.check('#f-confirm'); await page.click('#save-btn');
  await page.waitForSelector('#view-meds:not([hidden])');
  assert.ok(await page.locator('li:has-text("Lisinopril")').count());
  step('manual entry works with no photo');

  // emergency card
  await page.click('#tabs [data-view=card]');
  await page.fill('#c-name', 'Jane Sample'); await page.fill('#c-allergies', 'penicillin'); await page.fill('#c-contact', 'Sam 555-0100');
  const card = await page.textContent('#card-text');
  assert.match(card, /Allergies: penicillin/); assert.match(card, /Gabapentin 300 mg/);
  assert.ok(await page.locator('#qr svg').count(), 'QR drawn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#txt-btn')]);
  const txt = require('node:fs').readFileSync(await dl.path(), 'utf8');
  assert.equal(txt.trim(), card.trim());
  step('emergency card, QR, txt export identical to card text');

  // reload persists
  await page.reload();
  assert.equal(await page.locator('#medlist > li').count(), 4);
  await page.click('#tabs [data-view=card]');
  assert.equal(await page.inputValue('#c-name'), 'Jane Sample');
  step('reload persists meds and card');

  // 390px viewport
  await page.setViewportSize({ width: 390, height: 800 });
  await page.click('#tabs [data-view=meds]');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, 'no horizontal overflow at 390px, got ' + overflow);
  for (const v of ['add', 'card', 'about']) { await page.click(`#tabs [data-view=${v}]`); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'overflow in ' + v); }
  step('390px: no horizontal overflow');
  await page.setViewportSize({ width: 1000, height: 900 });

  // delete all
  await page.click('#tabs [data-view=about]');
  await page.click('#wipe-btn'); await page.click('#wipe-yes');
  assert.equal(await page.evaluate(() => localStorage.getItem('daysleft.v1')), null);
  await page.reload();
  assert.equal(await page.locator('#medlist > li').count(), 0);
  step('delete all data clears localStorage');

  // offline: service worker has cached app + OCR assets from the scans above
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled
  await ctx.setOffline(true);
  await page.reload();
  await page.click('#tabs [data-view=add]');
  await page.click('[data-sample$="label2.png"]');
  await page.waitForSelector('#review:not([hidden])', { timeout: 120000 });
  assert.equal(await page.inputValue('#f-name'), 'Amlodipine');
  await ctx.setOffline(false);
  step('offline reload + OCR works');

  assert.deepEqual(external, [], 'no external requests: ' + external.join(','));
  step('no requests to any other host');
  assert.deepEqual(errors, [], 'console errors: ' + errors.join(' | '));
  step('no console errors');
  await browser.close();
  console.log('E2E PASS');
})().catch(e => { console.error('E2E FAIL', e); process.exit(1); });
