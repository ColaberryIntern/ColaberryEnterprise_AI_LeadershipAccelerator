/**
 * captureOperationalOnboarding.js
 *
 * Operational Onboarding + Guided Comprehension Sprint, 2026-05-16.
 *
 * Captures bounded production screenshots that prove the first-visit
 * framing cards render correctly for new operators AND disappear after
 * dismissal. Three states per surface:
 *   (a) first-visit, card visible (memory cleared)
 *   (b) dismissed via the "Got it" button (seenIntros set)
 *
 * The script uses two Playwright contexts. The first clears
 * workspaceMemory:v1 to simulate a fresh operator. The second seeds
 * seenIntros = { home: true, systemBps: true } to simulate the post-
 * dismiss state.
 *
 * Routed through scripts/captureHelpers.js — every PNG ≤1800px.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  boundedFullPage,
  writeCaptureSummary,
  readDefaultToken,
  MAX_SAFE_WIDTH,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operational-onboarding`,
);
const TOKEN = readDefaultToken();

const HOME_URL = `${BASE}/portal/home`;
const BPS_URL = `${BASE}/portal/project/system?tab=bps`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[onboarding] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });
  const entries = [];
  const push = (slug, label, info, outPath) => {
    entries.push({
      slug, label,
      file: path.basename(outPath),
      originalWidth: info.originalWidth,
      finalWidth: info.finalWidth,
      downscaled: info.downscaled,
    });
  };

  // ── 1. Cory Home — first visit (memory cleared, card visible) ────────
  console.log('[onboarding] 1 — Cory Home first-visit (card visible)');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
    });
    const page = await ctx.newPage();
    // Land on the page first so localStorage is accessible via the
    // production origin, then clear workspaceMemory and reload to
    // simulate a fresh-from-zero operator.
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      try { window.localStorage.removeItem('workspaceMemory:v1'); } catch (_e) { /* ignore */ }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out1 = path.join(OUT_DIR, '01-cory-home-first-visit-framing.png');
    const info1 = await safeScreenshot(page, out1, { fullPage: false, label: 'safe' });
    push('01-cory-home-first-visit-framing', 'Cory Home — first-visit framing card visible above priority card', info1, out1);
    await ctx.close();
  }

  // ── 2. Cory Home — dismissed (seenIntros.home = true) ──────────────
  console.log('[onboarding] 2 — Cory Home dismissed (card hidden)');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
      seededMemory: JSON.stringify({ seenIntros: { home: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out2 = path.join(OUT_DIR, '02-cory-home-after-dismiss.png');
    const info2 = await safeScreenshot(page, out2, { fullPage: false, label: 'safe' });
    push('02-cory-home-after-dismiss', 'Cory Home — after dismiss, card hidden, surface returns to default rhythm', info2, out2);
    await ctx.close();
  }

  // ── 3. System BPs — first visit (memory cleared, card visible) ─────
  console.log('[onboarding] 3 — System BPs first-visit (card visible)');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 2000 },
    });
    const page = await ctx.newPage();
    await page.goto(BPS_URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      try { window.localStorage.removeItem('workspaceMemory:v1'); } catch (_e) { /* ignore */ }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out3 = path.join(OUT_DIR, '03-system-bps-first-visit-framing.png');
    const info3 = await safeScreenshot(page, out3, { fullPage: false, label: 'safe' });
    push('03-system-bps-first-visit-framing', 'System BPs — first-visit framing card visible between editorial header and leverage block', info3, out3);
    await ctx.close();
  }

  // ── 4. System BPs — dismissed (seenIntros.systemBps = true) ─────────
  console.log('[onboarding] 4 — System BPs dismissed (card hidden)');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 2000 },
      seededMemory: JSON.stringify({ seenIntros: { systemBps: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(BPS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out4 = path.join(OUT_DIR, '04-system-bps-after-dismiss.png');
    const info4 = await safeScreenshot(page, out4, { fullPage: false, label: 'safe' });
    push('04-system-bps-after-dismiss', 'System BPs — after dismiss, card hidden, surface returns to default rhythm', info4, out4);
    await ctx.close();
  }

  // ── 5. System BPs — leverage block crop showing the Phase C clause ──
  console.log('[onboarding] 5 — leverage block with surgical reasoning clause');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 2000 },
      seededMemory: JSON.stringify({ seenIntros: { systemBps: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(BPS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const lev = document.querySelector('[aria-label="Operational leverage"]');
      if (lev) lev.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    const clip5 = await page.evaluate(({ max }) => {
      const el = document.querySelector('[aria-label="Operational leverage"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left - 12)),
        y: Math.max(0, Math.floor(r.top - 12)),
        width: Math.min(max, Math.ceil(r.width + 24)),
        height: Math.ceil(r.height + 24),
      };
    }, { max: MAX_SAFE_WIDTH });
    if (clip5) {
      const out5 = path.join(OUT_DIR, '05-leverage-block-with-phase-c-clause.png');
      const info5 = await safeScreenshot(page, out5, { clip: clip5, label: 'safe' });
      push('05-leverage-block-with-phase-c-clause', 'Leverage block — Phase C explanatory clause "the area where strengthening ripples furthest"', info5, out5);
    }
    await ctx.close();
  }

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);

  const oversize = entries.filter(e => e.finalWidth && e.finalWidth > MAX_SAFE_WIDTH);
  if (oversize.length) {
    console.error(`[onboarding] ✗ ${oversize.length} PNG(s) exceed MAX_SAFE_WIDTH:`, oversize);
    process.exit(2);
  }
  console.log(`[onboarding] Done. ${entries.length} captures in ${OUT_DIR}, all ≤ ${MAX_SAFE_WIDTH}px.`);
})().catch(e => { console.error(e); process.exit(1); });
