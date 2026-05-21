/**
 * verifyBuildTiers — 2026-05-21.
 *
 * Verifies the 3-tier first-run flow end-to-end on production:
 *   run1 → Workflow  (regular LLM + 2-pass expand; verify doc word count)
 *   run2 → Full Project (Architect mode=professional; verify build started)
 *   run3 → Fully Autonomous (Architect mode=autonomous; verify build started)
 *
 * Drives: choose screen → idea → answer questions → tier-specific build.
 * Screenshots key stops. Reads back build_mode / word count to confirm.
 *
 * Run: node scripts/verifyBuildTiers.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const BASE = 'https://enterprise.colaberry.ai';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', '2026-05-21-build-tiers');
const REPO = 'https://github.com/octocat/Hello-World';
const IDEA = 'A small-business CRM that automatically tags incoming leads by industry, routes hot leads to a single account owner based on territory, and emails a weekly digest summarizing pipeline health and conversion trends.';

const ONLY = (() => { const i = process.argv.indexOf('--only'); return i === -1 ? null : process.argv[i + 1]; })();
const TIERS = [
  { runIdx: 0, key: 'workflow', card: /^A workflow/, bottom: /Generate My Requirements/i },
  { runIdx: 1, key: 'full', card: /^A full project/, bottom: /Continue.*connect your repo/i, start: /Start full build/i, expectMode: 'professional' },
  { runIdx: 2, key: 'autonomous', card: /^Fully autonomous/, bottom: /Continue.*connect your repo/i, start: /Start autonomous build/i, expectMode: 'autonomous' },
].filter(t => !ONLY || t.key === ONLY);

async function jwtFor(token) {
  const r = await fetch(`${BASE}/api/portal/verify?token=${token}`);
  return (await r.json()).jwt;
}
async function api(jwt, p) {
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${jwt}` } });
  return r.json();
}

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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const metas = JSON.parse(fs.readFileSync(path.resolve(__dirname, '.demo_onboarding_runs.json'), 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const tier of TIERS) {
    const meta = metas[tier.runIdx];
    const jwt = await jwtFor(meta.portal_token);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(t => { try { localStorage.setItem('participant_token', t); localStorage.removeItem('requirements_builder_state'); } catch (e) {} }, jwt);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const r = { tier: tier.key, email: meta.email, ok: false, errs };
    const shot = (n) => safeScreenshot(page, path.join(OUT, `${tier.key}-${n}.png`), { fullPage: true });

    try {
      await page.goto(`${BASE}/portal/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByRole('button', { name: tier.card }).waitFor({ state: 'visible', timeout: 30000 });
      if (tier.runIdx === 0) await shot('01-choose');           // capture the chooser once
      await page.getByRole('button', { name: tier.card }).click();
      await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('textarea').first().fill(IDEA);
      await page.getByRole('button', { name: /continue/i }).first().click();
      // questions
      await page.waitForFunction(() => /Question\s+\d+\s+of/i.test(document.body.innerText), null, { timeout: 90000 });
      const gotBottom = await answerUntil(page, tier.bottom);
      if (!gotBottom) throw new Error('tier action button never appeared after answering');
      await shot('02-questions-answered');

      if (tier.key === 'workflow') {
        await page.getByRole('button', { name: tier.bottom }).click();
        // wait for review (2-pass can take a few min)
        await page.getByText(/Your Requirements Are Ready/i).waitFor({ state: 'visible', timeout: 12 * 60 * 1000 });
        const badge = await page.getByText(/\bwords\b/i).first().innerText().catch(() => '');
        r.words = badge.replace(/\D/g, '');
        await shot('03-review');
        r.ok = !!r.words && parseInt(r.words, 10) > 0;
        r.detail = `doc ${r.words} words`;
      } else {
        await page.getByRole('button', { name: tier.bottom }).click();
        await page.getByPlaceholder(/github\.com\/your-org/i).waitFor({ state: 'visible', timeout: 15000 });
        await page.getByPlaceholder(/github\.com\/your-org/i).fill(REPO);
        await shot('03-repo');
        await page.getByRole('button', { name: tier.start }).click();
        await page.waitForFunction(() => location.pathname.includes('/portal/project/demo'), null, { timeout: 30000 });
        await page.waitForTimeout(8000);
        await shot('04-demo');
        const proj = await api(jwt, '/api/portal/project');
        const mode = proj?.setup_status?.build_mode;
        const status = await api(jwt, '/api/portal/project/architect-status');
        r.mode = mode; r.architect_phase = status.phase;
        r.ok = mode === tier.expectMode && !!status.phase && status.phase !== 'not_started';
        r.detail = `mode=${mode} (expected ${tier.expectMode}), architect phase=${status.phase}`;
      }
    } catch (e) {
      r.error = e.message;
      await shot('FAILURE').catch(() => {});
    }
    console.log(`[tiers] ${tier.key}: ${r.ok ? 'OK' : 'FAIL'} — ${r.detail || r.error} (pageerrors ${errs.length})`);
    results.push(r);
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'tiers.json'), JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2));
  console.log(`[tiers] RESULT: ${results.filter(r => r.ok).length}/${results.length} ok`);
  process.exit(results.every(r => r.ok) ? 0 : 2);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
