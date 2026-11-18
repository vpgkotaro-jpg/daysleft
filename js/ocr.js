// On-device OCR with tesseract.js (Tesseract LSTM). Worker, wasm core and English model are served
// from ./vendor on the same origin: no CDN, no upload. Works offline once cached.
const abs = p => new URL(p, document.baseURI).href;
let workerP = null;
let progressCb = () => {};

function getWorker() {
  if (!workerP) {
    workerP = window.Tesseract.createWorker('eng', 1, {
      workerPath: abs('vendor/tesseract/worker.min.js'),
      corePath: abs('vendor/tesseract/core'),
      langPath: abs('vendor/tesseract/lang'),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
      logger: m => progressCb(m),
    }).catch(e => { workerP = null; throw e; });
  }
  return workerP;
}

/** Downscale big phone photos so OCR stays fast; returns a canvas. */
export async function toCanvas(blobOrUrl, maxW = 1800) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (typeof blobOrUrl !== 'string') URL.revokeObjectURL(url);
  return c;
}

export async function recognize(canvas, onProgress = () => {}) {
  progressCb = onProgress;
  const w = await getWorker();
  const { data } = await w.recognize(canvas);
  const lines = (data.lines || [])
    .map(l => ({ text: l.text.replace(/\s+$/, ''), confidence: l.confidence, bbox: l.bbox }))
    .filter(l => l.text.trim());
  return { lines, text: data.text, confidence: data.confidence };
}
