/**
 * edit.js: repaint ONE region of a picked thumbnail, for the one defect the review page
 * keeps finding: the model invents words on a prop (a card, a screen, a sign) that
 * nobody wrote. Step 3 of README.md. Runs inside `accelerator-backend` like generate.js.
 *
 *   docker exec accelerator-backend node /tmp/edit.js <image.png> <mask.png> <out.png> "<prompt>"
 *
 * The mask is a PNG the same size as the image: TRANSPARENT where the model may paint,
 * opaque everywhere else (finalize.py --mask-poly draws one).
 *
 * THE MASK IS A HINT, NOT A FENCE. Measured 2026-09-18: asked to repaint only the words
 * on a card, the model redrew the whole card and dropped the photograph on it. So the
 * output of this script is never used directly: finalize.py pastes back ONLY the masked
 * polygon (feathered) onto the untouched original. Say in the prompt what must stay, so
 * the pasted region lines up with what surrounds it.
 *
 * Failure: one attempt, 240 s cap, non-zero exit with the API's error body. A person
 * reruns it; there is nothing to retry automatically when the result is judged by eye.
 */
'use strict';
const fs = require('fs');

const [, , img, mask, out, prompt, modelArg] = process.argv;
if (!img || !mask || !out || !prompt) {
  console.error('usage: node edit.js image.png mask.png out.png "<prompt>" [model]');
  process.exit(2);
}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY missing (run inside accelerator-backend)'); process.exit(2); }
const MODEL = modelArg || 'gpt-image-2.5-flare';

(async () => {
  const fd = new FormData();
  fd.append('model', MODEL);
  fd.append('prompt', prompt);
  fd.append('size', '1536x1024');
  fd.append('quality', 'high');
  fd.append('n', '1');
  fd.append('image', new Blob([fs.readFileSync(img)], { type: 'image/png' }), 'image.png');
  fd.append('mask', new Blob([fs.readFileSync(mask)], { type: 'image/png' }), 'mask.png');
  const t0 = Date.now();
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd, signal: AbortSignal.timeout(240000),
  });
  const text = await r.text();
  if (!r.ok) {
    console.log(JSON.stringify({ ok: false, error_class: 'UpstreamError', status: r.status, body: text.slice(0, 400) }));
    process.exit(1);
  }
  const j = JSON.parse(text);
  fs.writeFileSync(out, Buffer.from(j.data[0].b64_json, 'base64'));
  console.log(JSON.stringify({ ok: true, model: MODEL, ms: Date.now() - t0, bytes: fs.statSync(out).size, usage: j.usage || null }));
})().catch((e) => {
  console.log(JSON.stringify({ ok: false, error_class: e.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamError', error: String(e.message) }));
  process.exit(1);
});
