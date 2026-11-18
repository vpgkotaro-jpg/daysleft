// Generates the synthetic SAMPLE label images (fictional patients, fictional pharmacy) with Playwright.
// Usage: NODE_PATH=<dir with playwright installed> node tools/make-samples.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const LABELS = [
  { id: 'label1', drug: 'METFORMIN HCL 500 MG TABLET', sig: 'TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS', qty: 'QTY: 60', extra: '30 DAY SUPPLY', patient: 'JANE SAMPLEPERSON', rx: '0000123', width: 760 },
  { id: 'label2', drug: 'Amlodipine 5 mg tablets', sig: 'Take one tablet by mouth every morning', qty: 'Qty: 90', extra: 'Refills: 2', patient: 'John Q. Fictional', rx: '0000456', width: 700 },
  { id: 'label3', drug: 'GABAPENTIN 300 MG CAPSULE', sig: 'TAKE 1 CAPSULE BY MOUTH EVERY 8 HOURS', qty: 'QTY: 90', extra: 'REFILLS: 1', patient: 'ALEX TESTPATIENT', rx: '0000789', width: 560 },
];

const html = (l, cond) => `<!doctype html><html><body style="margin:0;background:${cond === 'rotate' ? '#8a8f94' : '#fff'}">
<svg width="0" height="0"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0"/></filter></svg>
<div id="stage" style="padding:${cond === 'rotate' ? '70px 80px' : '20px'};display:inline-block;position:relative;${cond === 'lowres' ? 'zoom:0.55;' : ''}">
 <div style="width:${l.width}px;background:#fff;border:3px solid #222;border-radius:10px;padding:0 0 14px;font-family:Arial,Helvetica,sans-serif;color:#111;position:relative;${cond === 'rotate' ? 'transform:rotate(2.5deg);box-shadow:8px 10px 18px rgba(0,0,0,.45);' : ''}">
  <div style="background:#c1121f;color:#fff;font-weight:700;letter-spacing:1px;padding:8px 16px;border-radius:7px 7px 0 0;font-size:17px">SAMPLE - NOT A REAL PRESCRIPTION</div>
  <div style="padding:12px 18px 0;font-size:16px;display:flex;justify-content:space-between"><span>FICTIONAL PHARMACY</span><span>RX# ${l.rx}</span></div>
  <div style="padding:2px 18px 10px;font-size:16px;color:#333">${l.patient}</div>
  <div style="padding:6px 18px;font-size:26px;font-weight:700">${l.drug}</div>
  <div style="padding:8px 18px;font-size:21px;font-weight:600;line-height:1.35">${l.sig}</div>
  <div style="padding:8px 18px 0;font-size:20px;display:flex;gap:28px"><b>${l.qty}</b><span>${l.extra}</span></div>
  <div style="padding:10px 18px 0;font-size:13px;color:#444">DISCARD AFTER 12/31/2027 &nbsp; (sample data, fictional)</div>
 </div>
 ${cond === 'noisy' ? '<div style="position:absolute;inset:0;filter:url(#n);mix-blend-mode:multiply;opacity:.55"></div>' : ''}
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1000, height: 700 } });
  fs.mkdirSync(path.join(root, 'eval/images'), { recursive: true });
  fs.mkdirSync(path.join(root, 'samples'), { recursive: true });
  for (const l of LABELS) {
    for (const cond of ['clean', 'rotate', 'noisy', 'lowres']) {
      await page.setContent(html(l, cond));
      const el = page.locator('#stage');
      const jpeg = cond === 'noisy' || cond === 'lowres';
      const file = path.join(root, 'eval/images', `${l.id}_${cond}.${jpeg ? 'jpg' : 'png'}`);
      const style = cond === 'noisy' ? 'filter:blur(0.9px) contrast(.85)' : '';
      if (style) await page.addStyleTag({ content: `#stage{${style}}` });
      await el.screenshot(jpeg ? { path: file, type: 'jpeg', quality: cond === 'lowres' ? 40 : 55 } : { path: file });
      if (cond === 'clean') fs.copyFileSync(file, path.join(root, 'samples', `${l.id}.png`));
    }
  }
  await browser.close();
  console.log('done');
})();
