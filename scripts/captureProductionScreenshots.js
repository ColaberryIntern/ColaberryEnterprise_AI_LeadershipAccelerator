/**
 * captureProductionScreenshots.js
 *
 * Drives a headless Chromium against enterprise.colaberry.ai, injects the
 * participant token from scripts/.ali_jwt.txt into localStorage, and
 * captures a full-page PNG of every productization-arc surface into
 * docs/screenshots/<date>-deploy/.
 *
 * Usage:
 *   node scripts/captureProductionScreenshots.js
 *
 * Env:
 *   CAPTURE_BASE   override base URL (default https://enterprise.colaberry.ai)
 *   CAPTURE_TOKEN  override token (default reads scripts/.ali_jwt.txt)
 *   CAPTURE_OUT    override output dir (default docs/screenshots/<YYYY-MM-DD>-deploy)
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT,
  'docs',
  'screenshots',
  `${new Date().toISOString().slice(0, 10)}-deploy`,
);

const TOKEN = process.env.CAPTURE_TOKEN || (
  fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null
);

if (!TOKEN) {
  console.error(`[capture] No token found at ${TOKEN_FILE} and CAPTURE_TOKEN env not set.`);
  console.error(`[capture] Authenticated routes will redirect to /portal/login.`);
}

// Each entry: { slug, route, label, waitForSelector?, extraWaitMs? }
const SURFACES = [
  { slug: '00-public-landing', route: '/', label: 'Public landing' },
  { slug: '01-portal-login', route: '/portal/login', label: 'Portal login' },
  { slug: '02-cory-home', route: '/portal/home', label: 'Cory Home (L1)', extraWaitMs: 2500 },
  { slug: '03-critique-landing', route: '/portal/visual-workspace', label: 'Critique workspace landing', extraWaitMs: 1500 },
  { slug: '04-blueprint-execution-lane', route: '/portal/project/blueprint', label: 'Blueprint — ExecutionLane (L3)', extraWaitMs: 2500 },
  { slug: '05-system-tab-components', route: '/portal/project/system-v2?tab=components', label: 'System View — Components tab', extraWaitMs: 2500 },
  { slug: '06-system-tab-architecture', route: '/portal/project/system-v2?tab=architecture', label: 'System View — Architecture tab', extraWaitMs: 2500 },
  { slug: '07-system-tab-bps', route: '/portal/project/system-v2?tab=bps', label: 'System View — BPs tab', extraWaitMs: 2500 },
  { slug: '08-system-tab-operations', route: '/portal/project/system-v2?tab=operations', label: 'System View — Operations tab (advanced, lazy)', extraWaitMs: 3000 },
  { slug: '09-system-tab-cognition', route: '/portal/project/system-v2?tab=cognition', label: 'System View — Cognition tab (advanced, lazy)', extraWaitMs: 3000 },
  { slug: '10-blueprint-legacy-banner', route: '/portal/project/blueprint-legacy', label: 'Legacy Blueprint (with warning banner)', extraWaitMs: 2500 },
  { slug: '11-system-legacy-banner', route: '/portal/project/system-v2-legacy', label: 'Legacy System View (with warning banner)', extraWaitMs: 3000 },
];

// Wait for the unified-state endpoint (the canonical signal that the
// backend is fully warm) to return 200. Production rebuilds put the
// nginx proxy live before the backend has finished starting; capturing
// during that window catches "Could not load operational state" 502
// error pages instead of the real surfaces. Poll up to ~3 minutes.
async function waitForBackend(http, baseUrl, token) {
  const url = `${baseUrl}/api/portal/project/unified-state`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const maxAttempts = 18;     // 18 × 10s = 3 min ceiling
  const intervalMs = 10_000;
  process.stdout.write(`[capture] Healthcheck: ${url}\n`);
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await http.fetch(url, { headers, method: 'GET' });
      if (res.status === 200) {
        console.log(`[capture] Healthcheck: ✓ 200 on attempt ${i}`);
        return true;
      }
      process.stdout.write(`[capture]   attempt ${i}/${maxAttempts}: ${res.status} (waiting ${intervalMs/1000}s)\n`);
    } catch (err) {
      process.stdout.write(`[capture]   attempt ${i}/${maxAttempts}: error ${err.message} (waiting ${intervalMs/1000}s)\n`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log(`[capture] Healthcheck: ✗ never returned 200 — capturing anyway, expect error states`);
  return false;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[capture] Base: ${BASE}`);
  console.log(`[capture] Out:  ${OUT_DIR}`);
  console.log(`[capture] Token: ${TOKEN ? `${TOKEN.slice(0, 12)}…(${TOKEN.length} chars)` : 'NONE'}`);

  const browser = await chromium.launch({ headless: true });

  // Wait for backend to be warm before any capture. Skip with SKIP_HEALTHCHECK=1.
  if (!process.env.SKIP_HEALTHCHECK) {
    const ctx = await browser.newContext();
    await waitForBackend(ctx.request, BASE, TOKEN);
    await ctx.close();
  } else {
    console.log('[capture] SKIP_HEALTHCHECK set — proceeding without healthcheck');
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // retina-quality screenshots
  });

  // Inject the participant token into localStorage on EVERY page load,
  // before any script runs. This authenticates the SPA without going
  // through the login form.
  if (TOKEN) {
    await context.addInitScript((tok) => {
      try { window.localStorage.setItem('participant_token', tok); } catch { /* ignore */ }
    }, TOKEN);
  }

  const page = await context.newPage();

  const summary = [];
  for (const s of SURFACES) {
    const url = `${BASE}${s.route}`;
    const out = path.join(OUT_DIR, `${s.slug}.png`);
    process.stdout.write(`[capture] ${s.slug.padEnd(28)} ${s.route.padEnd(50)} → `);
    try {
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      const status = resp ? resp.status() : 'no-response';
      // Give SPA hydration a moment so we capture the fully-rendered page,
      // not the loading spinner.
      if (s.extraWaitMs) await page.waitForTimeout(s.extraWaitMs);
      await page.screenshot({ path: out, fullPage: true });
      // Read the post-render URL so we know if we got redirected to login.
      const finalUrl = page.url();
      const redirected = !finalUrl.endsWith(s.route);
      console.log(`${status} ${redirected ? '⚠ redirected → ' + finalUrl : 'ok'}`);
      summary.push({ slug: s.slug, label: s.label, route: s.route, file: path.basename(out), status, redirected, finalUrl });
    } catch (err) {
      console.log(`FAIL ${err.message}`);
      summary.push({ slug: s.slug, label: s.label, route: s.route, file: null, error: err.message });
    }
  }

  await browser.close();

  // Write a small summary JSON next to the screenshots so the doc can read it.
  fs.writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[capture] Done. ${summary.filter(s => s.file).length}/${summary.length} screenshots saved to ${OUT_DIR}`);
  if (summary.some(s => s.redirected)) {
    console.log(`[capture] ⚠ Some routes redirected — token may be expired.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
