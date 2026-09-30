#!/usr/bin/env node
// buildInternDeliveryDashboard.js
//
// Intern Delivery Command Center - snapshot builder.
//
// Harvests Basecamp (Internship/Apprenticeship 24865175 + Gov Contracts
// 47346103), computes delivery metrics, narrates them, and writes a single JSON
// snapshot. Rendering is a SEPARATE step (renderInternDeliveryDashboard.js) so
// the HTML can be regenerated, restyled, or re-themed without spending another
// Basecamp or OpenAI call, and so the renderer stays a pure function of data.
//
// Runs where the credentials live (prod backend container). Locally it will
// resolve BASECAMP_ACCESS_TOKEN from env if you have one.
//
// Usage:
//   node backend/src/scripts/buildInternDeliveryDashboard.js [--out <path>] [--no-llm] [--lookback 14]
//
// Failure modes handled: missing token (fail fast, AuthError), Basecamp 429/5xx
// (bounded retry with backoff), missing todolist (skipped, logged), OpenAI
// unavailable (deterministic narrative fallback), malformed LLM JSON (per-item
// fallback). Idempotent: same snapshot in, same snapshot out, no side effects
// beyond writing the output file.

const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); } catch (_e) { /* optional */ }

const { harvestDelivery } = require(path.resolve(__dirname, './lib/internDeliveryData'));
const { computeDelivery } = require(path.resolve(__dirname, './lib/internDeliveryMetrics'));
const { enrichNarrative } = require(path.resolve(__dirname, './lib/internDeliveryNarrative'));

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const NO_LLM = process.argv.includes('--no-llm');
const LOOKBACK = parseInt(arg('--lookback', '14'), 10);
const OUT = arg('--out', path.resolve(process.cwd(), 'intern-delivery-snapshot.json'));
// The raw harvest is cached beside the snapshot so metric or narrative changes
// can be re-run without hammering the Basecamp API again. --from-raw skips
// straight to the compute stage.
const RAW_OUT = arg('--raw-out', OUT.replace(/\.json$/, '') + '.raw.json');
const FROM_RAW = process.argv.includes('--from-raw');

function log(msg) { console.log(`[intern-delivery] ${msg}`); }

async function resolveToken() {
  const envToken = String(process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
  try {
    const { getBasecampToken } = require(path.resolve(__dirname, './lib/basecampToken'));
    const t = await getBasecampToken();
    if (t) return t;
  } catch (e) {
    if (!envToken) throw e;
    log(`token resolver unavailable (${e.message}); falling back to env token`);
  }
  return envToken;
}

(async () => {
  const startedAt = Date.now();
  log(`start; lookback=${LOOKBACK}d, llm=${!NO_LLM}`);

  let raw;
  if (FROM_RAW) {
    if (!fs.existsSync(RAW_OUT)) {
      const e = new Error(`--from-raw given but no cached harvest at ${RAW_OUT}`);
      e.error_class = 'ValidationError';
      throw e;
    }
    raw = JSON.parse(fs.readFileSync(RAW_OUT, 'utf8'));
    log(`reusing cached harvest from ${RAW_OUT} (captured ${raw.generatedAt})`);
  } else {
    const token = await resolveToken();
    if (!token) {
      const e = new Error('No Basecamp token available (set BASECAMP_ACCESS_TOKEN or run where CCPP is reachable)');
      e.error_class = 'AuthError';
      throw e;
    }
    log(`basecamp token resolved (${String(token).length} chars)`);

    raw = await harvestDelivery({ token, lookbackDays: LOOKBACK, historyDays: 28, onProgress: log });
    fs.writeFileSync(RAW_OUT, JSON.stringify(raw));
    log(`raw harvest cached: ${RAW_OUT}`);
  }
  log(`harvest complete: ${raw.projects.length} projects, ${raw.commentCount} comments, ${raw.people.length} people in scope`);

  const data = computeDelivery(raw);
  log(`metrics complete: ${data.people.length} people (${data.portfolio.peopleActive} active), ${data.projects.length} projects, ${data.portfolio.taskDone}/${data.portfolio.taskTotal} tasks done`);

  if (NO_LLM) {
    delete process.env.OPENAI_API_KEY;
  }
  await enrichNarrative(data, { onProgress: log });
  log(`narrative complete: mode=${data.meta.narrativeMode}, decision queue=${data.decisionQueue.length}`);

  data.meta.buildDurationMs = Date.now() - startedAt;
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
  log(`snapshot written: ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
})().catch((e) => {
  console.error(`[intern-delivery] FATAL ${e.error_class || 'Error'}: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
