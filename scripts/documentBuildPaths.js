/**
 * documentBuildPaths — 2026-05-21.
 *
 * Drives each of the 3 build tiers end-to-end on production, timing every
 * step and screenshotting key stops, then writes per-path timing data for a
 * report. Uses one idea across all paths for an apples-to-apples comparison.
 *
 *   run1 → Workflow         (regular LLM + 2-pass + no-repo build-out)
 *   run2 → Full Project     (Architect professional → retrieve → build-out)
 *   run3 → Fully Autonomous (Architect autonomous → retrieve → build-out)
 *
 * Workflow is synchronous (~5 min). Full/Autonomous fire the build, then this
 * polls architect-status to completion and onboarding caps to build-out,
 * timing each phase (~15 / ~25 min).
 *
 * Run: node scripts/documentBuildPaths.js --paths workflow
 *      node scripts/documentBuildPaths.js --paths full,autonomous
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const BASE = 'https://enterprise.colaberry.ai';
const ARCHITECT_BASE = 'https://advisor.colaberry.ai';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', '2026-05-21-path-timing');
const REPO = 'https://github.com/octocat/Hello-World';
const IDEA = 'AI handles all the annoying life stuff. Emails, texts, bills, appointments, subscriptions, reminders all flow into one AI workflow. The AI detects bills due, finds scheduling conflicts, reminds about renewals, summarizes important emails, creates calendar events, drafts replies, organizes receipts, and reminds about birthdays and events.';

const PATHS = {
  workflow: { runIdx: 0, name: 'Workflow', card: /^A workflow/, kind: 'workflow' },
  full: { runIdx: 1, name: 'Full Project', card: /^A full project/, kind: 'architect', mode: 'professional', start: /Start full build/i },
  autonomous: { runIdx: 2, name: 'Fully Autonomous', card: /^Fully autonomous/, kind: 'architect', mode: 'autonomous', start: /Start autonomous build/i },
};

const want = (() => { const i = process.argv.indexOf('--paths'); return i === -1 ? Object.keys(PATHS) : process.argv[i + 1].split(','); })();

function now() { return Date.now(); }
async function jwtFor(token) { return (await (await fetch(`${BASE}/api/portal/verify?token=${token}`)).json()).jwt; }
async function apiGet(jwt, p) { try { return await (await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${jwt}` } })).json(); } catch { return {}; } }

async function answerUntil(page, bottomRe) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('button', { name: bottomRe }).count() > 0) return true;
    const yes = page.getByRole('button', { name: /^yes$/i });
    if (await yes.count() === 0) break;
    await yes.first().click();
    await page.waitForTimeout(450);
  }
  return (await page.getByRole('button', { name: bottomRe }).count()) > 0;
}

async function runPath(browser, key) {
  const cfg = PATHS[key];
  const metas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '.demo_onboarding_runs.json'), 'utf8'));
  const meta = metas[cfg.runIdx];
  const jwt = await jwtFor(meta.portal_token);
  const dir = path.join(OUT, key); fs.mkdirSync(dir, { recursive: true });
  const steps = [];
  const t0 = now();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('participant_token', t); localStorage.removeItem('requirements_builder_state'); } catch (e) {} }, jwt);
  const page = await ctx.newPage();
  let shotN = 0;
  const shot = async (label) => { shotN++; try { await safeScreenshot(page, path.join(dir, `${String(shotN).padStart(2, '0')}-${label}.png`), { fullPage: true }); } catch {} };
  const timed = async (label, fn) => { const s = now(); let ok = true, err = null; try { await fn(); } catch (e) { ok = false; err = e.message; } steps.push({ label, durationMs: now() - s, ok, error: err }); if (!ok) throw new Error(`${label}: ${err}`); };
  const result = { path: key, name: cfg.name, email: meta.email };
  const log = (m) => console.log(`[doc:${key}] ${new Date().toISOString().slice(11, 19)} ${m}`);

  try {
    await timed('load_chooser', async () => {
      await page.goto(`${BASE}/portal/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByRole('button', { name: cfg.card }).waitFor({ state: 'visible', timeout: 30000 });
    });
    await shot('chooser');
    await timed('choose_idea', async () => {
      await page.getByRole('button', { name: cfg.card }).click();
      await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('textarea').first().fill(IDEA);
    });
    await timed('generate_questions', async () => {
      await page.getByRole('button', { name: /continue/i }).first().click();
      await page.waitForFunction(() => /Question\s+\d+\s+of/i.test(document.body.innerText), null, { timeout: 90000 });
    });
    await shot('questions');
    const bottomRe = cfg.kind === 'workflow' ? /Generate My Requirements/i : /Continue.*connect your repo/i;
    await timed('answer_questions', async () => { if (!await answerUntil(page, bottomRe)) throw new Error('action button missing'); });

    if (cfg.kind === 'workflow') {
      await timed('document_generation', async () => {
        await page.getByRole('button', { name: /Generate My Requirements/i }).click();
        await page.getByText(/Your Requirements Are Ready/i).waitFor({ timeout: 16 * 60 * 1000 });
      });
      const words = (await page.getByText(/\bwords\b/i).first().innerText().catch(() => '')).replace(/\D/g, '');
      result.doc_words = words ? parseInt(words, 10) : null;
      await shot('review');
      await timed('save_and_build_out', async () => {
        await page.getByRole('button', { name: /Save .*Continue Setup/i }).click();
        await page.getByText(/Your system is ready/i).waitFor({ timeout: 6 * 60 * 1000 });
      });
      await shot('built');
    } else {
      await timed('connect_repo_start', async () => {
        await page.getByRole('button', { name: bottomRe }).click();
        await page.getByPlaceholder(/github\.com\/your-org/i).fill(REPO);
        await page.getByRole('button', { name: cfg.start }).click();
        await page.waitForFunction(() => location.pathname.includes('/portal/project/demo'), null, { timeout: 30000 });
      });
      await page.waitForTimeout(6000);
      await shot('demo-live');
      // Poll architect-status to completion (record phase changes).
      const buildStart = now();
      const phases = [];
      let lastPhase = '';
      await timed('architect_build', async () => {
        const deadline = now() + 40 * 60 * 1000;
        while (now() < deadline) {
          const s = await apiGet(jwt, '/api/portal/project/architect-status');
          if (s.phase && s.phase !== lastPhase) { phases.push({ phase: s.phase, atMs: now() - buildStart, progress: s.progress }); log(`phase ${s.phase} ${s.progress || ''}%`); lastPhase = s.phase; }
          if (s.complete) return;
          await new Promise(r => setTimeout(r, 15000));
        }
        throw new Error('architect build timed out');
      });
      result.phases = phases;
      // Build-out: clustering persists capabilities in BATCHES, so the count
      // climbs over time. Wait until it STABILIZES (unchanged for ~30s) rather
      // than recording the first non-zero batch — otherwise we capture a
      // mid-clustering snapshot that under-reports caps/reqs.
      await timed('retrieve_and_build_out', async () => {
        const deadline = now() + 12 * 60 * 1000;
        let prevCaps = -1, stable = 0;
        while (now() < deadline) {
          await apiGet(jwt, '/api/portal/project/architect-status'); // nudge retrieval
          const st = await apiGet(jwt, '/api/portal/onboarding/state');
          const caps = st.capability_count || 0;
          stable = (caps > 0 && caps === prevCaps) ? stable + 1 : 0;
          prevCaps = caps;
          result.caps = caps; result.reqs = st.requirements_count;
          if (caps > 0 && stable >= 2) return; // count held steady across 2 checks
          await new Promise(r => setTimeout(r, 15000));
        }
        if ((result.caps || 0) > 0) return; // non-zero but still settling at deadline
        throw new Error('build-out (clustering) did not complete');
      });
      // Final built-out surface
      await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await shot('built-system');
    }

    const finalState = await apiGet(jwt, '/api/portal/onboarding/state');
    result.caps = result.caps != null ? result.caps : finalState.capability_count;
    result.reqs = result.reqs != null ? result.reqs : finalState.requirements_count;
    result.stage = finalState.stage;
    result.ok = (result.caps || 0) > 0;
  } catch (e) {
    result.ok = false; result.error = e.message;
    await shot('FAILURE');
    log(`FAILED: ${e.message}`);
  } finally {
    await ctx.close();
  }
  result.totalMs = now() - t0;
  result.totalMin = +(result.totalMs / 60000).toFixed(2);
  result.steps = steps;
  log(`${result.ok ? 'OK' : 'FAIL'} total ${result.totalMin} min · caps ${result.caps} · reqs ${result.reqs}`);
  return result;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const key of want) { if (PATHS[key]) results.push(await runPath(browser, key)); }
  } finally { await browser.close(); }
  // Merge into a cumulative timings file (so separate invocations combine).
  const file = path.join(OUT, 'timings.json');
  let existing = { generated_at: new Date().toISOString(), idea: IDEA, results: [] };
  if (fs.existsSync(file)) { try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} }
  existing.generated_at = new Date().toISOString();
  existing.idea = IDEA;
  for (const r of results) { existing.results = existing.results.filter(x => x.path !== r.path); existing.results.push(r); }
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`[doc] wrote ${file}`);
  console.log(`[doc] RESULT: ${results.filter(r => r.ok).length}/${results.length} ok`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
