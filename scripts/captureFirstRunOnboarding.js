/**
 * captureFirstRunOnboarding — 2026-05-20.
 *
 * Headless verification of the first-run experience for a brand-new user
 * (no project, no requirements, no caps). Signs in via magic-link as the
 * demo account, takes screenshots of every surface a first-run user lands
 * on, asserts a few invariants, and writes a stamped HTML report so
 * before/after states can be compared across fixes.
 *
 * Why this exists: the test-account walkthrough doc described the intended
 * state, but the live home is showing a misleading dashboard for users
 * with no project. From now on, every first-run fix re-runs this script
 * to verify the visual result matches the claim.
 *
 * Run:
 *   node scripts/captureFirstRunOnboarding.js
 *
 * Output:
 *   docs/screenshots/<YYYY-MM-DD>-firstrun/*.png
 *   docs/screenshots/<YYYY-MM-DD>-firstrun/REPORT.html
 *
 * Env overrides:
 *   CAPTURE_BASE   default: https://enterprise.colaberry.ai
 *   DEMO_TOKEN     magic-link token (default: read from .demo_portal_token.txt)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-firstrun`);

const DEMO_TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.demo_portal_token.txt');
const DEMO_TOKEN = process.env.DEMO_TOKEN
  || (fs.existsSync(DEMO_TOKEN_FILE) ? fs.readFileSync(DEMO_TOKEN_FILE, 'utf8').trim() : null);

if (!DEMO_TOKEN) {
  console.error('FATAL: no demo magic-link token. Set DEMO_TOKEN env or write to scripts/.demo_portal_token.txt');
  process.exit(1);
}

const { createSafeContext, safeScreenshot } = require('./captureHelpers');

// Screenshots to take. Each entry produces one PNG and one row in the report.
const STOPS = [
  {
    id: '01-verify-landing',
    title: 'Magic-link verify landing',
    url: `/portal/verify?token=${DEMO_TOKEN}`,
    settleMs: 1500,
    assertion: 'Page should auto-redirect to /portal/home after verifying.',
  },
  {
    id: '02-home-first-run',
    title: 'Home — first-run state (no project, no requirements)',
    url: '/portal/home',
    settleMs: 1500,
    assertion: 'Home should embed the requirements builder, not show empty 0% tiles. Top-nav tabs should be disabled.',
  },
  {
    id: '03-requirements-builder-direct',
    title: 'Requirements builder — direct navigation',
    url: '/portal/project/requirements-builder',
    settleMs: 1500,
    assertion: 'Should land on the idea-capture textarea (Phase 1).',
  },
  {
    id: '04-critique-tab-attempt',
    title: 'Critique tab — what happens when first-run user clicks it',
    url: '/portal/visual-workspace',
    settleMs: 1500,
    assertion: 'Should refuse (gate enforced) or redirect to onboarding.',
  },
  {
    id: '05-system-tab-attempt',
    title: 'System tab — first-run access',
    url: '/portal/project/system?tab=bps',
    settleMs: 1500,
    assertion: 'Should show empty state framed as "add requirements first," not stale BP rows.',
  },
  {
    id: '06-blueprint-tab-attempt',
    title: 'Blueprint tab — first-run access',
    url: '/portal/project/blueprint',
    settleMs: 1500,
    assertion: 'Should surface the onboarding step, not an empty execution lane.',
  },
];

async function signInAndCapture() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[firstrun] base=${BASE} out=${OUT_DIR}`);
  console.log(`[firstrun] using demo token ${DEMO_TOKEN.slice(0, 8)}…`);

  const browser = await chromium.launch({ headless: true });
  // Use a fresh context — no Ali JWT seeded; we want a true first-run state.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  // Capture console errors so the report can flag broken pages.
  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push({ when: new Date().toISOString(), msg: err.message }));
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push({ when: new Date().toISOString(), msg: m.text() });
  });

  const results = [];
  for (const stop of STOPS) {
    const url = `${BASE}${stop.url}`;
    console.log(`[firstrun] → ${stop.id}: ${url}`);
    const errorsBefore = consoleErrors.length;
    let navOk = true;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    } catch (err) {
      navOk = false;
      console.warn(`[firstrun]   nav failed: ${err.message}`);
    }
    if (navOk) await page.waitForTimeout(stop.settleMs);

    const outPath = path.join(OUT_DIR, `${stop.id}.png`);
    try {
      await safeScreenshot(page, outPath, { fullPage: true });
    } catch (err) {
      console.warn(`[firstrun]   screenshot failed: ${err.message}`);
    }

    // Pull a few hint signals from the page so the report can summarize.
    let title = '';
    let h1 = '';
    let bodyText = '';
    try {
      title = await page.title();
      h1 = await page.evaluate(() => document.querySelector('h1, h2')?.textContent?.trim().slice(0, 160) || '');
      bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 800) || '');
    } catch { /* ignore */ }

    const newErrors = consoleErrors.slice(errorsBefore);
    results.push({
      ...stop,
      title,
      h1,
      bodyText,
      pngPath: path.relative(OUT_DIR, outPath),
      navOk,
      newErrors,
      capturedAt: new Date().toISOString(),
    });
  }

  await browser.close();
  return results;
}

function htmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReport(results) {
  const rows = results.map(r => `
    <section class="stop">
      <h2>${htmlEscape(r.title)}</h2>
      <div class="meta">
        <span><b>URL:</b> <code>${htmlEscape(r.url)}</code></span>
        <span><b>Page title:</b> ${htmlEscape(r.title) || '<em>(empty)</em>'}</span>
        ${r.h1 ? `<span><b>Top heading:</b> ${htmlEscape(r.h1)}</span>` : ''}
        <span><b>Nav ok:</b> ${r.navOk ? '<span class="ok">yes</span>' : '<span class="err">no</span>'}</span>
        ${r.newErrors.length > 0 ? `<span class="err"><b>Console errors:</b> ${r.newErrors.length}</span>` : ''}
      </div>
      <p class="assertion"><b>Expected:</b> ${htmlEscape(r.assertion)}</p>
      <img src="${htmlEscape(r.pngPath)}" alt="${htmlEscape(r.title)}" />
      ${r.newErrors.length > 0 ? `<details class="errors"><summary>Console errors (${r.newErrors.length})</summary><pre>${htmlEscape(r.newErrors.map(e => `[${e.when}] ${e.msg}`).join('\n'))}</pre></details>` : ''}
      ${r.bodyText ? `<details class="body-text"><summary>First 800 chars of body text</summary><pre>${htmlEscape(r.bodyText)}</pre></details>` : ''}
    </section>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>First-Run Onboarding Capture — ${DATE}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; color: #1f2937; background: #f8fafc; line-height: 1.55; }
  h1 { font-size: 24px; color: #1a365d; margin-bottom: 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 2rem; }
  .stop { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.4rem; margin: 1rem 0; box-shadow: 0 1px 3px rgba(15,23,42,0.04); }
  .stop h2 { margin: 0 0 8px; font-size: 17px; color: #1a365d; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: #6b7280; margin-bottom: 8px; }
  .meta b { color: #1f2937; font-weight: 600; }
  .assertion { font-size: 13px; color: #4b5563; margin: 8px 0 12px; padding: 8px 12px; background: #f1f5f9; border-left: 3px solid #3b82f6; border-radius: 0 4px 4px 0; }
  img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; display: block; margin: 8px 0; }
  code { font-family: ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
  pre { background: #f1f5f9; padding: 0.6rem 0.8rem; border-radius: 4px; font-size: 11.5px; overflow-x: auto; white-space: pre-wrap; }
  details { font-size: 12px; margin: 8px 0; }
  details summary { cursor: pointer; color: #6b7280; }
  .ok { color: #15803d; font-weight: 600; }
  .err { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
<h1>First-Run Onboarding — Live Capture</h1>
<div class="sub">Captured ${new Date().toISOString()} · ${results.length} stops · base ${htmlEscape(BASE)}</div>
${rows}
</body>
</html>`;
}

(async () => {
  const results = await signInAndCapture();
  const reportPath = path.join(OUT_DIR, 'REPORT.html');
  fs.writeFileSync(reportPath, buildReport(results), 'utf8');
  console.log(`\n[firstrun] report: ${reportPath}`);
  console.log(`[firstrun] ${results.length} screenshots, ${results.reduce((s, r) => s + r.newErrors.length, 0)} console errors total.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
