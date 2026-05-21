/**
 * captureBuildOut — 2026-05-20.
 *
 * Phase 2 of the full pipeline: takes the three demo accounts that already
 * have a saved requirements document (produced by driveRequirementsBuilder)
 * and runs the real BUILD-OUT — POST /api/portal/project/setup/activate —
 * which parses the requirements into a RequirementsMap and clusters them
 * into a Capability → Feature hierarchy. Then it verifies, via API, that the
 * build-out actually populated the project, and screenshots the resulting
 * Blueprint and System surfaces so the setup can be reviewed visually.
 *
 * Prerequisite: the activation gate (setup_status.github_connected) must be
 * satisfied first — run backend/src/scripts/enableDemoBuildOut.js in the
 * container. Without it, activateProject() throws "GitHub repository not
 * connected yet" and this script reports that clearly.
 *
 * Inputs:
 *   scripts/.demo_onboarding_runs.json   (run → portal_token)
 * Output (continues numbering from the generation phase, 09+):
 *   <CAPTURE_OUT>/run<N>/09-blueprint-before.png ... 12-*.png
 *   <CAPTURE_OUT>/buildout.json
 *
 * Run (after generation phase + gate script):
 *   CAPTURE_OUT=docs/screenshots/2026-05-20-buildout-e2e node scripts/captureBuildOut.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-buildout-e2e`);
const RUNS_FILE = path.join(REPO_ROOT, 'scripts', '.demo_onboarding_runs.json');

const ACTIVATION_MAX_MS = 15 * 60 * 1000;
const ELEMENT_TIMEOUT = 30 * 1000;
const SHOT_START = 9; // generation phase used 01..08

const NAMES = { 1: 'LeadFlow CRM', 2: 'ShelfSense Inventory', 3: 'CareBridge Intake' };

function log(runId, msg) { console.log(`[buildout]${runId ? ` run${runId}` : ''} ${msg}`); }
function nowMs() { return Date.now(); }

async function api(jwt, urlPath, opts = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function fetchJwt(token) {
  // direct verify (no auth header needed)
  const res = await fetch(`${BASE}/api/portal/verify?token=${token}`);
  if (!res.ok) throw new Error(`verify HTTP ${res.status}`);
  const body = await res.json();
  if (!body.jwt) throw new Error('verify returned no jwt');
  return body.jwt;
}

function capCounts(capsResp) {
  const caps = Array.isArray(capsResp) ? capsResp : (capsResp && capsResp.capabilities) || [];
  const features = caps.reduce((s, c) => s + ((c.features && c.features.length) || 0), 0);
  return { capabilities: caps.length, features };
}

async function runOne(browser, runMeta) {
  const runDir = path.join(OUT_DIR, `run${runMeta.run}`);
  if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });

  const steps = [];
  const screenshots = [];
  const consoleErrors = [];
  const start = nowMs();
  let shotIndex = SHOT_START - 1;

  async function shot(page, label) {
    shotIndex += 1;
    const file = `${String(shotIndex).padStart(2, '0')}-${label}.png`;
    const out = path.join(runDir, file);
    try {
      await safeScreenshot(page, out, { fullPage: true });
      screenshots.push({ label, file: path.relative(OUT_DIR, out).replace(/\\/g, '/') });
    } catch (e) { log(runMeta.run, `screenshot '${label}' failed: ${e.message}`); }
  }
  async function timed(label, fn) {
    const s = nowMs();
    let ok = true, error = null, value;
    try { value = await fn(); } catch (e) { ok = false; error = e.message; }
    steps.push({ label, durationMs: nowMs() - s, ok, error });
    if (!ok) throw new Error(`step '${label}' failed: ${error}`);
    return value;
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', err => consoleErrors.push({ when: new Date().toISOString(), msg: err.message }));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ when: new Date().toISOString(), msg: m.text() }); });

  const result = { run: runMeta.run, name: NAMES[runMeta.run] || `Run ${runMeta.run}`, email: runMeta.email, enrollment_id: runMeta.enrollment_id };

  try {
    const jwt = await timed('auth_verify', () => fetchJwt(runMeta.portal_token));
    await ctx.addInitScript((t) => { try { window.localStorage.setItem('participant_token', t); } catch (_e) {} }, jwt);

    // Pre-check: doc saved + gate satisfied.
    await timed('precheck_gate', async () => {
      const st = await api(jwt, '/api/portal/project/setup/status');
      const ss = (st.json && (st.json.setup_status || st.json)) || {};
      if (!ss.requirements_loaded) throw new Error('requirements not loaded — run the generation phase first');
      if (!ss.github_connected) throw new Error('github_connected gate not satisfied — run enableDemoBuildOut.js in the container first');
    });

    // Blueprint BEFORE activation (read-only; ExecutionLane does not auto-activate).
    await timed('load_blueprint_before', async () => {
      await page.goto(`${BASE}/portal/project/blueprint`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      await page.waitForTimeout(2500);
    });
    await shot(page, 'blueprint-before');

    // Trigger the real build-out.
    await timed('post_activate', async () => {
      const r = await api(jwt, '/api/portal/project/setup/activate', { method: 'POST' });
      if (!r.ok) throw new Error(`activate HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    });

    // Poll activation-progress until complete (this is where clustering happens).
    const activation = await timed('activation', async () => {
      const deadline = nowMs() + ACTIVATION_MAX_MS;
      let last = '';
      while (true) {
        const p = await api(jwt, '/api/portal/project/setup/activation-progress');
        const st = p.json || {};
        if (st.status === 'complete') return { message: st.message, capabilities: st.capabilities };
        if (st.status === 'failed') throw new Error(`activation failed: ${st.error || st.message}`);
        const msg = st.message || st.status || '';
        if (msg !== last) { log(runMeta.run, `  activating: ${msg}${st.percent != null ? ' ' + st.percent + '%' : ''}`); last = msg; }
        if (nowMs() > deadline) throw new Error('activation timed out');
        await new Promise(r => setTimeout(r, 3000));
      }
    });
    result.activation_message = activation.message;

    // Verify build-out via API — capabilities + features + requirements map.
    const verify = await timed('verify_buildout', async () => {
      const caps = await api(jwt, '/api/portal/project/capabilities');
      const counts = capCounts(caps.json);
      const map = await api(jwt, '/api/portal/project/requirements/map');
      const reqs = (map.json && (map.json.requirements || [])).length || (map.json && map.json.total) || 0;
      if (counts.capabilities < 1) throw new Error(`build-out produced 0 capabilities`);
      return { ...counts, requirements: reqs, map_summary: map.json && { total: map.json.total, matched: map.json.matched, unmatched: map.json.unmatched } };
    });
    result.counts = verify;
    log(runMeta.run, `built out: ${verify.capabilities} capabilities, ${verify.features} features, ${verify.requirements} requirements`);

    // Result surfaces.
    await timed('load_blueprint_after', async () => {
      await page.goto(`${BASE}/portal/project/blueprint`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      await page.waitForTimeout(3000);
    });
    await shot(page, 'blueprint-built');

    await timed('load_system_bps', async () => {
      await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      await page.waitForTimeout(3000);
    });
    await shot(page, 'system-bps');

    await timed('load_system_overview', async () => {
      await page.goto(`${BASE}/portal/project/system`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      await page.waitForTimeout(3000);
    });
    await shot(page, 'system-overview');

    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.failure = e.message;
    await shot(page, 'FAILURE');
    log(runMeta.run, `FAILED: ${e.message}`);
  } finally {
    await ctx.close();
  }

  result.steps = steps;
  result.screenshots = screenshots;
  result.consoleErrors = consoleErrors;
  result.totalMs = nowMs() - start;
  result.totalMin = +(result.totalMs / 60000).toFixed(2);
  log(runMeta.run, `${result.ok ? 'OK' : 'FAIL'} in ${result.totalMin} min`);
  return result;
}

(async () => {
  if (!fs.existsSync(RUNS_FILE)) { console.error(`Missing ${RUNS_FILE}.`); process.exit(1); }
  const runMetas = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  const argRuns = (() => {
    const i = process.argv.indexOf('--runs');
    return i === -1 ? null : process.argv[i + 1].split(',').map(s => parseInt(s.trim(), 10));
  })();
  const runs = runMetas.filter(r => !argRuns || argRuns.includes(r.run));
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  log('', `base=${BASE} out=${OUT_DIR} runs=${runs.map(r => r.run).join(',')}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const meta of runs) results.push(await runOne(browser, meta));
  } finally { await browser.close(); }

  const summary = {
    generated_at: new Date().toISOString(),
    base: BASE,
    runs: results,
    all_ok: results.length > 0 && results.every(r => r.ok),
  };
  const out = path.join(OUT_DIR, 'buildout.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  log('', `wrote ${out}`);
  log('', `RESULT: ${results.filter(r => r.ok).length}/${results.length} ok`);
  process.exit(summary.all_ok ? 0 : 2);
})().catch(err => { console.error(err); process.exit(1); });
