#!/usr/bin/env node
/**
 * generateOnHost.js — generates one AI thumbnail image per curriculum type.
 *
 * RUNS ON THE VPS HOST (node >= 20, global fetch) where OPENAI_API_KEY lives —
 * the key is read from the prod host .env and never printed. Zero dependencies.
 *
 * Usage (on the host):
 *   node generateOnHost.js [--dry-run] [--only slug1,slug2] [--model gpt-image-2]
 *
 * Failure-first design:
 *  - What happens if a generation fails? -> capped retries (3) with backoff,
 *    then the slug is recorded in failures[] and the run CONTINUES; rerunning
 *    the script only regenerates missing files (idempotent by output file).
 *  - Recovery path if all retries exhausted -> rerun the script; still-missing
 *    slugs are listed at the end (exit code 1 signals partial failure).
 *  - Handled failure modes: HTTP 4xx/5xx, 429 rate limit (longer backoff),
 *    network errors, hang (180s abort timeout), malformed/empty b64 payload.
 *  - Not handled: an invalid/revoked API key (fails fast on first image).
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/root/thumb-gen';
const RAW_DIR = path.join(ROOT, 'raw');
const ENV_FILE = '/opt/colaberry-accelerator/.env';
const PROMPTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'prompts.json'), 'utf8'));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const only = (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean);
const MODEL = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'gpt-image-2';
const SIZE = '1536x1024';

function apiKey() {
  const m = fs.readFileSync(ENV_FILE, 'utf8').match(/^OPENAI_API_KEY=(.*)$/m);
  if (!m || !m[1].trim()) throw new Error('OPENAI_API_KEY not found in host .env');
  return m[1].trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(key, prompt, attempt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180_000); // explicit timeout, never unbounded
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, size: SIZE, quality: 'medium', n: 1 }),
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = (body.error && body.error.message ? body.error.message : `HTTP ${res.status}`).slice(0, 200);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    const b64 = body.data && body.data[0] && body.data[0].b64_json;
    if (!b64) throw new Error('empty b64_json in response');
    return Buffer.from(b64, 'base64');
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const key = apiKey();
  const types = PROMPTS.types.filter((t) => !only.length || only.includes(t.slug));
  const failures = [];
  let done = 0, skipped = 0;

  for (const t of types) {
    const out = path.join(RAW_DIR, `${t.slug}.png`);
    if (fs.existsSync(out) && fs.statSync(out).size > 10_000) {
      skipped += 1;
      console.log(JSON.stringify({ event: 'skip_exists', slug: t.slug }));
      continue;
    }
    const prompt = `${t.scene} ${PROMPTS.style_suffix}`;
    if (DRY) { console.log(JSON.stringify({ event: 'dry_run', slug: t.slug, chars: prompt.length })); continue; }

    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
      const started = Date.now();
      try {
        const png = await generateOne(key, prompt, attempt);
        fs.writeFileSync(out, png);
        done += 1;
        ok = true;
        console.log(JSON.stringify({ event: 'generated', slug: t.slug, bytes: png.length, attempt, duration_ms: Date.now() - started, progress: `${done + skipped}/${types.length}` }));
      } catch (e) {
        const errClass = e.name === 'AbortError' ? 'TimeoutError' : e.status === 429 ? 'RateLimitError' : e.status >= 500 ? 'UpstreamUnavailable' : 'GenerationError';
        console.log(JSON.stringify({ event: 'attempt_failed', slug: t.slug, attempt, error_class: errClass, message: String(e.message).slice(0, 200), duration_ms: Date.now() - started }));
        if (attempt < 3) await sleep(errClass === 'RateLimitError' ? 30_000 * attempt : 5_000 * attempt);
      }
    }
    if (!ok && !DRY) failures.push(t.slug);
    await sleep(1_500); // gentle pacing between serial generations
  }

  console.log(JSON.stringify({ event: 'run_complete', generated: done, skipped, failed: failures.length, failures }));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(JSON.stringify({ event: 'fatal', message: String(e.message).slice(0, 200) }));
  process.exit(1);
});
