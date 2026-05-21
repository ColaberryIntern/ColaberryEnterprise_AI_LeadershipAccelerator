/**
 * driveArchitectBuild — 2026-05-20.
 *
 * Drives the REAL requirements-document API end-to-end for the 3 demo
 * accounts: the AI Project Architect at advisor.colaberry.ai. Unlike the
 * fast OpenAI generate path, this is the 8-phase pipeline that actually
 * BUILDS the requirements document chapter by chapter (~30-45 min), then the
 * portal RETRIEVES it (architect-status → getArchitectDocument → saved to the
 * project) and BUILDS OUT the project (auto activateProject).
 *
 * The three builds are kicked off separately (POST /api/portal/project/
 * architect-build); this script POLLS GET /api/portal/project/architect-status
 * for all three in parallel until each completes, screenshots the Architect
 * dashboard at every phase change so the build can be followed, and on
 * completion verifies the document was retrieved and the project was built
 * out into capabilities (GET /capabilities), screenshotting the portal result.
 *
 * Inputs:  scripts/.demo_onboarding_runs.json (run → portal_token)
 * Output:  <CAPTURE_OUT>/run<N>/A##-<phase>.png  + architect.json
 *
 * Run (after the 3 builds are fired):
 *   CAPTURE_OUT=docs/screenshots/2026-05-20-architect-e2e node scripts/driveArchitectBuild.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const ARCHITECT_BASE = process.env.ARCHITECT_BASE || 'https://advisor.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-architect-e2e`);
const RUNS_FILE = path.join(REPO_ROOT, 'scripts', '.demo_onboarding_runs.json');

const POLL_INTERVAL_MS = 20 * 1000;
const GLOBAL_TIMEOUT_MS = 80 * 60 * 1000;     // all 3 builds should finish well inside this
const ACTIVATION_WAIT_MS = 8 * 60 * 1000;     // after doc retrieval, wait for clustering
const NAMES = { 1: 'LeadFlow CRM', 2: 'ShelfSense Inventory', 3: 'CareBridge Intake' };
const MAX_CHAPTER_SHOTS = 3;                  // throttle screenshots during the long chapter_build phase

function log(run, msg) { console.log(`[architect]${run ? ` run${run}` : ''} ${new Date().toISOString().slice(11, 19)} ${msg}`); }
function nowMs() { return Date.now(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jget(jwt, urlPath) {
  // Network errors must not crash the long poll loop — return a safe object.
  try {
    const res = await fetch(`${BASE}${urlPath}`, { headers: { Authorization: `Bearer ${jwt}` } });
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, json: text ? JSON.parse(text) : null }; }
    catch { return { ok: res.ok, status: res.status, json: null, text }; }
  } catch (e) {
    return { ok: false, status: 0, json: null, error: e.message };
  }
}
async function fetchJwt(token) {
  const res = await fetch(`${BASE}/api/portal/verify?token=${token}`);
  if (!res.ok) throw new Error(`verify HTTP ${res.status}`);
  const body = await res.json();
  if (!body.jwt) throw new Error('verify returned no jwt');
  return body.jwt;
}
function capCounts(c) {
  const caps = Array.isArray(c) ? c : (c && c.capabilities) || [];
  return { capabilities: caps.length, features: caps.reduce((s, x) => s + ((x.features && x.features.length) || 0), 0) };
}

(async () => {
  if (!fs.existsSync(RUNS_FILE)) { console.error(`Missing ${RUNS_FILE}`); process.exit(1); }
  const metas = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const pubCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pubPage = await pubCtx.newPage();

  // Per-run tracking.
  const state = {};
  for (const m of metas) {
    state[m.run] = {
      run: m.run, name: NAMES[m.run] || `Run ${m.run}`, email: m.email, enrollment_id: m.enrollment_id,
      jwt: await fetchJwt(m.portal_token), slug: null, lastPhase: null, phases: [], shots: [],
      chapterShots: 0, done: false, ok: false, startMs: nowMs(), completeMs: null, counts: null, doc_chars: null,
    };
  }

  const runDir = (r) => { const d = path.join(OUT_DIR, `run${r}`); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); return d; };
  let shotSeq = {};
  async function shotArchitect(s, phaseLabel) {
    if (!s.slug) return;
    shotSeq[s.run] = (shotSeq[s.run] || 0) + 1;
    const file = `A${String(shotSeq[s.run]).padStart(2, '0')}-${phaseLabel}.png`;
    const out = path.join(runDir(s.run), file);
    try {
      await pubPage.goto(`${ARCHITECT_BASE}/projects/${s.slug}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pubPage.waitForTimeout(2000);
      await safeScreenshot(pubPage, out, { fullPage: true });
      s.shots.push({ label: phaseLabel, file: path.relative(OUT_DIR, out).replace(/\\/g, '/') });
    } catch (e) { log(s.run, `architect screenshot '${phaseLabel}' failed: ${e.message}`); }
  }
  async function shotPortal(s, label, urlPath) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((t) => { try { window.localStorage.setItem('participant_token', t); } catch (_e) {} }, s.jwt);
    const page = await ctx.newPage();
    shotSeq[s.run] = (shotSeq[s.run] || 0) + 1;
    const file = `A${String(shotSeq[s.run]).padStart(2, '0')}-${label}.png`;
    const out = path.join(runDir(s.run), file);
    try {
      await page.goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await safeScreenshot(page, out, { fullPage: true });
      s.shots.push({ label, file: path.relative(OUT_DIR, out).replace(/\\/g, '/') });
    } catch (e) { log(s.run, `portal screenshot '${label}' failed: ${e.message}`); }
    await ctx.close();
  }

  async function handleComplete(s) {
    log(s.run, 'build complete — verifying retrieval + build-out');
    s.completeMs = nowMs();
    // Screenshot the Architect's finished dashboard.
    await shotArchitect(s, 'complete');
    // Measure the retrieved document length straight from the Architect.
    try {
      const dl = await fetch(`${ARCHITECT_BASE}/projects/${s.slug}/final-assembly/download`);
      if (dl.ok) { const t = await dl.text(); s.doc_chars = t.length; }
    } catch { /* non-critical */ }
    // architect-status (when complete) saved the doc + kicked activation async.
    // Poll the portal until requirements are loaded AND capabilities appear.
    const deadline = nowMs() + ACTIVATION_WAIT_MS;
    while (nowMs() < deadline) {
      const st = await jget(s.jwt, '/api/portal/onboarding/state');
      const caps = await jget(s.jwt, '/api/portal/project/capabilities');
      const cc = capCounts(caps.json);
      const loaded = st.json && st.json.has_requirements_doc;
      if (loaded && cc.capabilities > 0) { s.counts = cc; break; }
      s.counts = cc;
      await sleep(POLL_INTERVAL_MS);
      // keep nudging architect-status so the backend's retrieve+activate path runs
      await jget(s.jwt, '/api/portal/project/architect-status');
    }
    const map = await jget(s.jwt, '/api/portal/project/requirements/map');
    s.requirements = (map.json && (map.json.total || (map.json.requirements || []).length)) || 0;
    // Portal result surfaces.
    await shotPortal(s, 'portal-blueprint', '/portal/project/blueprint');
    await shotPortal(s, 'portal-system-bps', '/portal/project/system?tab=bps');
    s.ok = !!(s.counts && s.counts.capabilities > 0);
    s.done = true;
    log(s.run, `${s.ok ? 'OK' : 'INCOMPLETE'}: doc ${s.doc_chars || '?'} chars, ${s.counts ? s.counts.capabilities : 0} caps, ${s.requirements} reqs`);
  }

  const start = nowMs();
  log('', `polling 3 builds (interval ${POLL_INTERVAL_MS / 1000}s, timeout ${GLOBAL_TIMEOUT_MS / 60000}m)`);
  while (Object.values(state).some(s => !s.done)) {
    if (nowMs() - start > GLOBAL_TIMEOUT_MS) { log('', 'GLOBAL TIMEOUT — marking remaining as not done'); break; }
    for (const s of Object.values(state)) {
      if (s.done) continue;
      try {
      const r = await jget(s.jwt, '/api/portal/project/architect-status');
      const j = r.json || {};
      // architect-status doesn't return the slug; the Architect slugifies the
      // project name deterministically (matches the slug returned at build time).
      if (!s.slug) s.slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const phase = j.phase || 'unknown';
      const chap = `${j.chapters_done || 0}/${j.chapters_total || 0}`;
      // Screenshot on phase change; throttle chapter_build to a few.
      if (phase !== s.lastPhase) {
        log(s.run, `phase: ${phase} (${j.progress || 0}%) ${chap} — ${(j.message || '').slice(0, 60)}`);
        s.phases.push({ phase, at: new Date().toISOString(), progress: j.progress, chapters: chap });
        if (phase === 'chapter_build') {
          if (s.chapterShots < MAX_CHAPTER_SHOTS) { await shotArchitect(s, `chapter_build-${chap.replace('/', 'of')}`); s.chapterShots++; }
        } else if (phase !== 'complete') {
          // 'complete' is screenshotted once by handleComplete — avoid a duplicate here.
          await shotArchitect(s, phase);
        }
        s.lastPhase = phase;
      } else if (phase === 'chapter_build' && s.chapterShots < MAX_CHAPTER_SHOTS && (j.chapters_done || 0) > 0) {
        await shotArchitect(s, `chapter_build-${chap.replace('/', 'of')}`); s.chapterShots++;
      }
      if (j.complete) { await handleComplete(s); }
      } catch (e) {
        log(s.run, `poll iteration error (continuing): ${e.message}`);
      }
    }
    if (Object.values(state).some(s => !s.done)) await sleep(POLL_INTERVAL_MS);
  }

  await browser.close();
  const runs = Object.values(state).map(s => ({
    run: s.run, name: s.name, email: s.email, enrollment_id: s.enrollment_id, slug: s.slug,
    ok: s.ok, build_min: s.completeMs ? +((s.completeMs - s.startMs) / 60000).toFixed(2) : null,
    doc_chars: s.doc_chars, counts: s.counts, requirements: s.requirements, phases: s.phases, screenshots: s.shots,
  }));
  const summary = { generated_at: new Date().toISOString(), base: BASE, architect_base: ARCHITECT_BASE, runs, all_ok: runs.length > 0 && runs.every(r => r.ok) };
  fs.writeFileSync(path.join(OUT_DIR, 'architect.json'), JSON.stringify(summary, null, 2));
  log('', `wrote ${path.join(OUT_DIR, 'architect.json')}`);
  log('', `RESULT: ${runs.filter(r => r.ok).length}/${runs.length} ok`);
  process.exit(summary.all_ok ? 0 : 2);
})().catch(err => { console.error(err); process.exit(1); });
