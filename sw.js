// Offline support. App code: network first, cache fallback. Big vendor files and samples: cache on first use.
const CACHE = 'daysleft-v2';
const SHELL = ['./', 'index.html', 'style.css', 'icon.svg', 'js/app.js', 'js/parser.js', 'js/daysleft.js', 'js/emergency.js', 'js/ocr.js', 'js/storage.js', 'vendor/qrcode.js', 'vendor/tesseract/tesseract.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const heavy = /\/(vendor|samples)\//.test(url.pathname);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (heavy) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
