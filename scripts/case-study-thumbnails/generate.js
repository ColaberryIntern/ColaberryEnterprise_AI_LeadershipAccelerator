/**
 * generate.js: three YouTube-style thumbnail concepts per case study, from OpenAI's
 * newest image model. Step 1 of scripts/case-study-thumbnails/README.md.
 *
 * WHERE IT RUNS. Inside `accelerator-backend` on the production host, because that is
 * where the Enterprise OpenAI key lives, and the key must never be copied off the box
 * (reference: the 2026-07-01 rotation after off-server spend). Copy in, run, copy the
 * PNGs out, delete:
 *
 *   docker cp generate.js accelerator-backend:/tmp/ && docker cp prompts.json accelerator-backend:/tmp/
 *   docker exec accelerator-backend node /tmp/generate.js /tmp/prompts.json /tmp/thumbs-out 3
 *   docker cp accelerator-backend:/tmp/thumbs-out ./out && docker exec accelerator-backend rm -rf /tmp/thumbs-out /tmp/generate.js /tmp/prompts.json
 *
 * prompts.json: { "style": "<shared style line>", "items": [ { slug, title, concept, name, prompt } ] }
 * (prompts.example.json is the set Ali picked from on 2026-09-18.)
 *
 * MODEL. The newest non-mini `gpt-image-*` the key can list, highest version first
 * (2026-09-18: `gpt-image-2.5-flare`). Chosen at run time so the script does not pin a
 * model that later retires; the choice is written to manifest.json.
 *
 * FAILURE MODES HANDLED: HTTP errors and timeouts retry 3 times with 5 s, 10 s, 15 s
 * backoff, each attempt capped at 240 s; a missing image in a 200 response counts as a
 * failure. NOT handled: a model that renders the words wrongly or invents extra text.
 * That is caught by a person on the review page, and fixed with edit.js.
 *
 * IDEMPOTENT. An item whose PNG already exists (over 10 KB) is skipped, so a rerun after
 * a partial failure only pays for the missing ones. Exit 0 only when every item exists.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const [, , promptsPath, outDir, concArg] = process.argv;
if (!promptsPath || !outDir) {
  console.error('usage: node generate.js prompts.json outDir [concurrency]');
  process.exit(2);
}
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY missing (run inside accelerator-backend)'); process.exit(2); }
const CONC = Math.max(1, Math.min(6, Number(concArg || 3)));
const SIZE = '1536x1024';
const QUALITY = 'high';
fs.mkdirSync(outDir, { recursive: true });

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

function versionOf(id) {
  const n = parseFloat(id.replace(/^gpt-image-/, ''));
  return Number.isFinite(n) ? n : 0;
}

async function pickModel() {
  const r = await fetch('https://api.openai.com/v1/models', { headers, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`models HTTP ${r.status}`);
  const j = await r.json();
  const ids = (j.data || []).map((m) => m.id).filter((id) => /^gpt-image/.test(id));
  ids.sort((a, b) => (versionOf(b) - versionOf(a)) || (a.length - b.length));
  const full = ids.filter((id) => !/mini/.test(id));
  return { chosen: full[0] || ids[0] || 'gpt-image-1', available: ids };
}

async function generate(model, item, file) {
  const body = { model, prompt: `${item.prompt}\n\nStyle: ${item.style}`, size: SIZE, quality: QUALITY, n: 1, output_format: 'png' };
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240000),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
      const j = JSON.parse(text);
      const b64 = j.data && j.data[0] && j.data[0].b64_json;
      if (!b64) throw new Error('no b64_json in response');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      const bytes = fs.statSync(file).size;
      log({ event: 'generated', slug: item.slug, concept: item.concept, model, ms: Date.now() - t0, bytes, usage: j.usage || null, attempt });
      return { ok: true, bytes, usage: j.usage || null };
    } catch (e) {
      lastErr = e;
      log({ event: 'attempt_failed', error_class: e.name === 'TimeoutError' ? 'TimeoutError' : 'UpstreamError', slug: item.slug, concept: item.concept, attempt, error: String(e.message).slice(0, 300) });
      await new Promise((res) => setTimeout(res, 5000 * attempt));
    }
  }
  return { ok: false, error: String(lastErr && lastErr.message) };
}

(async () => {
  const spec = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
  if (!spec.style || !Array.isArray(spec.items) || !spec.items.length) throw new Error('prompts.json needs "style" and a non-empty "items"');
  for (const it of spec.items) {
    for (const k of ['slug', 'title', 'concept', 'name', 'prompt']) if (!it[k]) throw new Error(`item missing "${k}": ${JSON.stringify(it).slice(0, 120)}`);
  }
  const { chosen, available } = await pickModel();
  log({ event: 'model', chosen, available });
  const items = spec.items.map((it) => ({ ...it, style: spec.style }));
  const manifest = { model: chosen, size: SIZE, quality: QUALITY, startedAt: new Date().toISOString(), results: [] };
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      const file = path.join(outDir, `${item.slug}-${item.concept}.png`);
      const base = { slug: item.slug, concept: item.concept, name: item.name, title: item.title, prompt: item.prompt, file: path.basename(file) };
      if (fs.existsSync(file) && fs.statSync(file).size > 10000) {
        log({ event: 'skipped_exists', slug: item.slug, concept: item.concept });
        manifest.results.push({ ...base, ok: true, skipped: true });
        continue;
      }
      manifest.results.push({ ...base, ...(await generate(chosen, item, file)) });
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const ok = manifest.results.filter((r) => r.ok).length;
  log({ event: 'done', ok, failed: manifest.results.length - ok });
  process.exit(ok === manifest.results.length ? 0 : 1);
})().catch((e) => { log({ event: 'fatal', error_class: 'ContractViolation', error: String(e.message) }); process.exit(1); });
