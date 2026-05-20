/**
 * driveRequirementsBuilder — 2026-05-20.
 *
 * Drives the portal first-run requirements-builder flow END TO END with a
 * real headless browser, for three different demo enrollments / projects.
 * Unlike captureFirstRunOnboarding (which only navigates + screenshots),
 * this script actually types the idea, answers the AI questions, generates
 * the requirements doc, saves it, and verifies persistence — timing every
 * step and screenshotting every stop.
 *
 * Goal: prove the flow can produce 3 different documents in a row, each
 * within a 30-minute budget, and record exactly where time goes + what
 * breaks so it can be hardened.
 *
 * Auth: each run fetches GET /api/portal/verify?token=<uuid> to exchange the
 * magic-link token for a 7-day JWT, then seeds localStorage.participant_token
 * before navigation (the SPA's portalApi reads that key).
 *
 * Inputs:
 *   scripts/.demo_onboarding_runs.json   (written by provisionDemoOnboardingRuns)
 *     [{ run, email, enrollment_id, portal_token, portal_url }, ...]
 *
 * Run:
 *   node scripts/driveRequirementsBuilder.js                # all 3
 *   node scripts/driveRequirementsBuilder.js --runs 1,3     # subset
 *   CAPTURE_BASE=https://enterprise.colaberry.ai node scripts/driveRequirementsBuilder.js
 *
 * Output:
 *   docs/screenshots/<YYYY-MM-DD>-onboarding-e2e/run<N>/*.png
 *   docs/screenshots/<YYYY-MM-DD>-onboarding-e2e/timings.json
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-onboarding-e2e`);
const RUNS_FILE = path.join(REPO_ROOT, 'scripts', '.demo_onboarding_runs.json');

const DOC_BUDGET_MS = 30 * 60 * 1000;        // hard 30-min ceiling per document
const GENERATION_MAX_MS = 18 * 60 * 1000;    // generation step ceiling (component itself times out at 10 min)
const ELEMENT_TIMEOUT = 30 * 1000;

// Three genuinely different project domains so the LLM questions differ.
const PROJECTS = [
  {
    run: 1,
    name: 'LeadFlow CRM',
    idea: 'A small-business CRM that automatically tags incoming leads by industry, '
      + 'routes hot leads to a single account owner based on territory, and emails a '
      + 'weekly digest summarizing pipeline health, stalled deals, and conversion rate trends.',
    // Simplest happy path: accept every capability.
    answer: () => 'yes',
  },
  {
    run: 2,
    name: 'ShelfSense Inventory',
    idea: 'A multi-location retail inventory platform that forecasts restock needs from '
      + 'historical sales velocity, flags likely shrinkage and theft from count discrepancies, '
      + 'and auto-generates purchase orders to the right supplier when stock dips below par levels.',
    // Mixed path: mostly yes, decline every 4th capability.
    answer: (i) => ((i + 1) % 4 === 0 ? 'no' : 'yes'),
  },
  {
    run: 3,
    name: 'CareBridge Intake',
    idea: 'A healthcare patient-intake scheduler that collects demographics and insurance '
      + 'details through a guided form, verifies insurance eligibility in real time, books '
      + 'appointments against provider availability, and sends SMS and email appointment reminders.',
    // Exercise the Modify path on the 2nd question, accept the rest.
    answer: (i) => (i === 1 ? 'modify' : 'yes'),
  },
];

// ─── small utilities ────────────────────────────────────────────────

function log(runId, msg) {
  console.log(`[e2e]${runId ? ` run${runId}` : ''} ${msg}`);
}

function nowMs() { return Date.now(); }

/** Exchange a magic-link token for a participant JWT. */
async function fetchJwt(token) {
  const res = await fetch(`${BASE}/api/portal/verify?token=${token}`);
  if (!res.ok) throw new Error(`verify failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.jwt) throw new Error('verify returned no jwt');
  return body.jwt;
}

/** Read onboarding state via API (for invariant checks, not UI). */
async function fetchOnboardingState(jwt) {
  const res = await fetch(`${BASE}/api/portal/onboarding/state`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error(`onboarding/state HTTP ${res.status}`);
  return res.json();
}

async function bodyText(page) {
  try { return await page.evaluate(() => document.body?.innerText || ''); }
  catch { return ''; }
}

/** Parse "Question N of M" out of the current page. Returns {n,m} or null. */
async function readCounter(page) {
  const t = await bodyText(page);
  const match = t.match(/Question\s+(\d+)\s+of\s+(\d+)/i);
  if (!match) return null;
  return { n: parseInt(match[1], 10), m: parseInt(match[2], 10) };
}

// ─── the flow ───────────────────────────────────────────────────────

async function runOne(browser, project, runMeta) {
  const runDir = path.join(OUT_DIR, `run${project.run}`);
  if (!fs.existsSync(runDir)) fs.mkdirSync(runDir, { recursive: true });

  const steps = [];
  const screenshots = [];
  const consoleErrors = [];
  const runStart = nowMs();
  const deadline = runStart + DOC_BUDGET_MS;

  // step timing helper bound to this run
  let shotIndex = 0;
  async function shot(page, label) {
    shotIndex += 1;
    const file = `${String(shotIndex).padStart(2, '0')}-${label}.png`;
    const out = path.join(runDir, file);
    try {
      await safeScreenshot(page, out, { fullPage: true });
      screenshots.push({ label, file: path.relative(OUT_DIR, out) });
    } catch (e) {
      log(project.run, `screenshot '${label}' failed: ${e.message}`);
    }
  }
  async function timed(label, fn) {
    const s = nowMs();
    let ok = true; let error = null; let value;
    try { value = await fn(); }
    catch (e) { ok = false; error = e.message; }
    const e = nowMs();
    steps.push({ label, startMs: s - runStart, durationMs: e - s, ok, error });
    if (!ok) throw new Error(`step '${label}' failed: ${error}`);
    return value;
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  ctx.on('page', () => {});
  const page = await ctx.newPage();
  page.on('pageerror', err => consoleErrors.push({ when: new Date().toISOString(), msg: err.message }));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push({ when: new Date().toISOString(), msg: m.text() }); });

  let result = { run: project.run, name: project.name, email: runMeta.email, enrollment_id: runMeta.enrollment_id };

  try {
    // 1. Auth — exchange token for JWT, seed localStorage before nav.
    const jwt = await timed('auth_verify', async () => fetchJwt(runMeta.portal_token));
    await ctx.addInitScript((t) => {
      try { window.localStorage.setItem('participant_token', t); } catch (_e) {}
    }, jwt);

    // Pre-flight invariant: this enrollment must be in first-run state.
    const preState = await timed('precheck_state', async () => fetchOnboardingState(jwt));
    if (preState.stage !== 'needs_requirements') {
      throw new Error(`expected stage=needs_requirements, got '${preState.stage}'. Reset the enrollment before driving.`);
    }

    // 2. Land on home — first-run should embed the builder.
    await timed('load_home', async () => {
      await page.goto(`${BASE}/portal/home`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      // Wait for the idea textarea (component rendered, not a 0% dashboard).
      await page.locator('textarea').first().waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT });
    });
    await shot(page, 'home-first-run');

    // Invariant: builder present, not the "caught up" dashboard.
    const homeText = await bodyText(page);
    if (/You're caught up|Readiness|Coverage|Health/i.test(homeText) && !/looking to build|Build Your Requirements/i.test(homeText)) {
      throw new Error('home shows dashboard, not first-run builder');
    }

    // 3. Phase 1 — type the idea, click Continue.
    await timed('fill_idea', async () => {
      const ta = page.locator('textarea').first();
      await ta.fill(project.idea);
      // Continue is gated until >=30 chars; confirm it enabled.
      const cont = page.getByRole('button', { name: /continue/i });
      await cont.waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT });
    });
    await shot(page, 'idea-filled');

    // 4. Continue -> expand-questions (LLM). Wait for the questions phase.
    await timed('expand_questions', async () => {
      await page.getByRole('button', { name: /continue/i }).click();
      // Either questions appear or an error alert. Wait for the counter.
      await page.waitForFunction(() => /Question\s+\d+\s+of\s+\d+/i.test(document.body.innerText)
        || /Could not generate questions/i.test(document.body.innerText), null, { timeout: 90 * 1000 });
      const errAlert = await page.locator('.alert-danger').count();
      if (errAlert > 0) {
        const txt = await page.locator('.alert-danger').first().innerText();
        throw new Error(`expand-questions error: ${txt.trim()}`);
      }
    });
    await shot(page, 'questions-first');

    // 5. Answer every question per the run's strategy.
    const answered = await timed('answer_questions', async () => {
      const counter0 = await readCounter(page);
      if (!counter0) throw new Error('no question counter visible');
      const m = counter0.m;
      let count = 0;
      for (let i = 0; i < m; i++) {
        const strat = project.answer(i);
        const isLast = i === m - 1;
        const before = await readCounter(page);
        if (strat === 'modify') {
          await page.getByRole('button', { name: /modified/i }).click();
          const modTa = page.locator('textarea').first();
          await modTa.fill('Make this capability configurable per organization with an audit trail.');
          await page.getByRole('button', { name: /^save$/i }).click();
        } else if (strat === 'no') {
          await page.getByRole('button', { name: /^no$/i }).click();
        } else {
          await page.getByRole('button', { name: /^yes$/i }).click();
        }
        count += 1;
        // Wait for advance unless we just answered the last question.
        if (!isLast) {
          await page.waitForFunction(
            (prevN) => {
              const mt = document.body.innerText.match(/Question\s+(\d+)\s+of/i);
              return mt && parseInt(mt[1], 10) > prevN;
            },
            before ? before.n : i + 1,
            { timeout: ELEMENT_TIMEOUT }
          );
        } else {
          await page.waitForTimeout(400); // let answeredCount/Generate settle
        }
      }
      return { questions: m, answered: count };
    });
    await shot(page, 'questions-answered');

    // 6. Generate. Requires answeredCount >= 5 for the button to render.
    await timed('click_generate', async () => {
      const gen = page.getByRole('button', { name: /Generate My Requirements/i });
      try {
        await gen.waitFor({ state: 'visible', timeout: 10 * 1000 });
      } catch {
        throw new Error(`Generate button never appeared (answered ${answered.answered}/${answered.questions}; needs >=5 answered)`);
      }
      await gen.click();
      await page.getByText(/Generating Your Requirements/i).waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT });
    });
    await shot(page, 'generating');

    // 7. Wait for generation to complete (review phase). Bounded by budget.
    await timed('generation', async () => {
      const budgetLeft = Math.max(5000, deadline - nowMs());
      const genTimeout = Math.min(GENERATION_MAX_MS, budgetLeft);
      const saveBtn = page.getByRole('button', { name: /Save .*Continue Setup/i });
      const startedAt = nowMs();
      // Poll for review readiness OR a generation error.
      while (true) {
        if (await saveBtn.count() > 0 && await saveBtn.first().isVisible()) break;
        const errCount = await page.locator('.alert-danger').count();
        if (errCount > 0) {
          const txt = await page.locator('.alert-danger').first().innerText();
          throw new Error(`generation error surfaced: ${txt.trim()}`);
        }
        if (nowMs() - startedAt > genTimeout) {
          throw new Error(`generation did not finish within ${Math.round(genTimeout / 1000)}s`);
        }
        await page.waitForTimeout(3000);
      }
    });
    await shot(page, 'review');

    // 8. Save -> complete.
    await timed('save', async () => {
      await page.getByRole('button', { name: /Save .*Continue Setup/i }).click();
      await page.getByText(/Requirements Saved/i).waitFor({ state: 'visible', timeout: 60 * 1000 });
    });
    await shot(page, 'complete');

    // 9. Verify persistence via API invariant.
    const postState = await timed('verify_persist', async () => fetchOnboardingState(jwt));
    if (postState.stage === 'needs_requirements' || !postState.has_requirements_doc) {
      throw new Error(`persistence not reflected: stage=${postState.stage}, has_doc=${postState.has_requirements_doc}`);
    }
    result.persisted_state = postState;

    // 10. Reload home — the builder should now be replaced by the dashboard.
    await timed('home_flips_to_dashboard', async () => {
      await page.goto(`${BASE}/portal/home`, { waitUntil: 'domcontentloaded', timeout: ELEMENT_TIMEOUT });
      await page.waitForTimeout(2500);
      const txt = await bodyText(page);
      if (/What are you looking to build|Build Your Requirements/i.test(txt)) {
        throw new Error('home still shows the first-run builder after save');
      }
    });
    await shot(page, 'home-dashboard');

    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.failure = e.message;
    await shot(page, 'FAILURE');
    result.failure_body_text = (await bodyText(page)).slice(0, 1200);
    log(project.run, `FAILED: ${e.message}`);
  } finally {
    await ctx.close();
  }

  const totalMs = nowMs() - runStart;
  result.steps = steps;
  result.screenshots = screenshots;
  result.consoleErrors = consoleErrors;
  result.totalMs = totalMs;
  result.totalMin = +(totalMs / 60000).toFixed(2);
  result.within_budget = totalMs <= DOC_BUDGET_MS;
  log(project.run, `${result.ok ? 'OK' : 'FAIL'} in ${result.totalMin} min `
    + `(${result.within_budget ? 'within' : 'OVER'} 30-min budget), ${consoleErrors.length} console errors`);
  return result;
}

// ─── orchestration ──────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(RUNS_FILE)) {
    console.error(`Missing ${RUNS_FILE}. Run provisionDemoOnboardingRuns first.`);
    process.exit(1);
  }
  const runMetas = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  const argRuns = (() => {
    const idx = process.argv.indexOf('--runs');
    if (idx === -1) return null;
    return process.argv[idx + 1].split(',').map(s => parseInt(s.trim(), 10));
  })();

  const projects = PROJECTS.filter(p => !argRuns || argRuns.includes(p.run));
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  log('', `base=${BASE} out=${OUT_DIR} runs=${projects.map(p => p.run).join(',')}`);
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const project of projects) {
      const meta = runMetas.find(r => r.run === project.run);
      if (!meta) { log(project.run, 'no token metadata; skipping'); continue; }
      results.push(await runOne(browser, project, meta));
    }
  } finally {
    await browser.close();
  }

  const summary = {
    generated_at: new Date().toISOString(),
    base: BASE,
    doc_budget_min: DOC_BUDGET_MS / 60000,
    runs: results,
    all_ok: results.length > 0 && results.every(r => r.ok),
    all_within_budget: results.every(r => r.within_budget),
  };
  const timingsPath = path.join(OUT_DIR, 'timings.json');
  fs.writeFileSync(timingsPath, JSON.stringify(summary, null, 2));
  log('', `wrote ${timingsPath}`);
  log('', `RESULT: ${results.filter(r => r.ok).length}/${results.length} ok, `
    + `all_within_budget=${summary.all_within_budget}`);

  process.exit(summary.all_ok ? 0 : 2);
})().catch(err => { console.error(err); process.exit(1); });
