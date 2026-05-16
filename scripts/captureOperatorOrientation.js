/**
 * captureOperatorOrientation.js
 *
 * Operator Orientation Sprint, 2026-05-15.
 *
 * Captures the operator-orientation surfaces on production Cory Home:
 *   01. Home — no focus signal yet (OperatorFocusCard hidden — control)
 *   02. Home — after engaging Lead Intelligence on System (OperatorFocusCard
 *       visible + ContinuationCard reframed as "Continue shaping …")
 *   03. Home — with focus + seeded lastContribution (shows the new "Last
 *       improvement" piece on the OperationalHistoryStrip)
 *   04. Crop of OperatorFocusCard alone for the review doc
 *
 * Routed through scripts/captureHelpers.js. The inline auth + viewport
 * pattern this script pioneered is now the shared helper's default.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  safeCrop,
  writeCaptureSummary,
  readDefaultToken,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operator-orientation`,
);
const TOKEN = readDefaultToken();

const FOCUS_DOMAIN_LABEL = 'Lead Intelligence';

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[orient] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });
  const entries = [];

  const clearMemoryLive = async (page) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('workspaceMemory:v1');
        window.localStorage.removeItem('continuationCard:dismissed');
        window.sessionStorage.removeItem('continuationCard:dismissed');
      } catch (_e) { /* ignore */ }
    });
  };

  const pushEntry = (slug, label, shotInfo, outPath) => {
    entries.push({
      slug,
      label,
      file: path.basename(outPath),
      originalWidth: shotInfo.originalWidth,
      finalWidth: shotInfo.finalWidth,
      downscaled: shotInfo.downscaled,
    });
  };

  // ── 01. Home, no focus signal (control) ────────────────────────────────
  {
    // Override the safe viewport height to capture more vertical scroll of Home.
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
    });
    const page = await ctx.newPage();
    console.log('[orient] 01-home-no-focus');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await clearMemoryLive(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out = path.join(OUT_DIR, '01-home-no-focus.png');
    const shotInfo = await safeScreenshot(page, out, { fullPage: false, label: 'safe' });
    pushEntry('01-home-no-focus', 'Home (no focus signal)', shotInfo, out);
    await ctx.close();
  }

  // ── 02. Home, after engaging Lead Intelligence on System ──────────────
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
    });
    const page = await ctx.newPage();
    console.log('[orient] 02-home-with-focus');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await clearMemoryLive(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    const clicked = await page.evaluate((targetLabel) => {
      const strip = document.querySelector('[aria-label^="Operational flow"]');
      if (!strip) return { ok: false, reason: 'no flow strip' };
      const stops = Array.from(strip.querySelectorAll('button'));
      const target = stops.find(b => b.textContent && b.textContent.includes(targetLabel)) || stops[1] || stops[0];
      if (!target) return { ok: false, reason: 'no stops' };
      target.click();
      return { ok: true, clicked: target.textContent.trim().slice(0, 60) };
    }, FOCUS_DOMAIN_LABEL);
    console.log('  click result:', clicked);
    await page.waitForTimeout(1800);

    const persisted = await page.evaluate(() => window.localStorage.getItem('workspaceMemory:v1'));
    console.log('  memory after click:', persisted ? persisted.slice(0, 140) + '…' : '(empty)');

    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out2 = path.join(OUT_DIR, '02-home-with-focus.png');
    const shot2 = await safeScreenshot(page, out2, { fullPage: false, label: 'safe' });
    pushEntry('02-home-with-focus', 'Home (with focus signal)', shot2, out2);

    const out4 = path.join(OUT_DIR, '04-operator-focus-card-crop.png');
    const cropInfo = await safeCrop(page, '[aria-label="Your operational focus"]', out4, { padding: 8, label: 'safe' });
    if (cropInfo) {
      console.log('  cropped OperatorFocusCard at', { x: cropInfo.x, y: cropInfo.y, width: cropInfo.width, height: cropInfo.height });
      pushEntry('04-operator-focus-card-crop', 'OperatorFocusCard crop', cropInfo, out4);
    } else {
      console.log('  [warn] OperatorFocusCard not found in DOM — focus signal may not have stuck');
    }
    await ctx.close();
  }

  // ── 03. Home, with focus + seeded lastContribution ─────────────────────
  {
    const seeded = {
      lastBpDomain: 'lead_intelligence',
      lastBpDomainLabel: 'Lead Intelligence',
      lastBpDomainAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      lastContribution: { domainLabel: 'Lead Intelligence', signal: 'readiness', at: new Date(Date.now() - 30 * 60_000).toISOString() },
      lastSnapshotAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      lastReadinessScore: 60,
      lastCoverageScore: 50,
      lastQueueSize: 12,
      lastHealthScore: 80,
    };
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
      seededMemory: JSON.stringify(seeded),
    });
    const page = await ctx.newPage();
    console.log('[orient] 03-home-with-contribution');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const out3 = path.join(OUT_DIR, '03-home-with-contribution.png');
    const shot3 = await safeScreenshot(page, out3, { fullPage: false, label: 'safe' });
    pushEntry('03-home-with-contribution', 'Home (with contribution)', shot3, out3);

    await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational history"]');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    const out5 = path.join(OUT_DIR, '05-history-strip-crop.png');
    const cropInfo5 = await safeCrop(page, '[aria-label="Operational history"]', out5, { padding: 16, label: 'safe' });
    if (cropInfo5) {
      console.log('  cropped OperationalHistoryStrip at', { x: cropInfo5.x, y: cropInfo5.y, width: cropInfo5.width, height: cropInfo5.height });
      pushEntry('05-history-strip-crop', 'OperationalHistoryStrip crop', cropInfo5, out5);
    }
    await ctx.close();
  }

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);
  console.log(`[orient] Done. ${entries.length} captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
