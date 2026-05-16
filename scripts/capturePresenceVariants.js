/**
 * capturePresenceVariants.js
 *
 * Workspace Presence Sprint, 2026-05-12.
 *
 * The base captureProductionScreenshots.js takes a cold first-visit
 * screenshot of Cory Home, but our momentum features (RecentlyMovedCard,
 * tile chevrons, "Last visit X ago") only render once memory contains
 * a prior snapshot to delta against.
 *
 * This script pre-seeds workspaceMemory:v1 in localStorage with prior
 * snapshot values that DIFFER from current state, then captures Cory
 * Home — forcing the momentum surfaces to render.
 *
 * Routed through scripts/captureHelpers.js so every PNG stays under
 * the Claude many-image dimension ceiling.
 *
 * Output → docs/screenshots/<YYYY-MM-DD>-presence-variants/
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  writeCaptureSummary,
  readDefaultToken,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-presence-variants`,
);
const TOKEN = readDefaultToken();

const FORWARD_SEED = {
  lastVisitedSurface: 'home',
  lastReadinessScore: 34,
  lastCoverageScore: 45,
  lastQueueSize: 4,
  lastHealthScore: 78,
  lastBuiltAt: '2026-05-12T08:00:00.000Z',
  lastSnapshotAt: new Date(Date.now() - 23 * 60_000).toISOString(),
  lastSeenNextActionId: 'STALE_SOURCE_ID_TO_TRIGGER_FRESH_HALO',
  updatedAt: new Date(Date.now() - 23 * 60_000).toISOString(),
};

const BACKWARD_SEED = {
  lastVisitedSurface: 'home',
  lastReadinessScore: 44,
  lastCoverageScore: 51,
  lastQueueSize: 0,
  lastHealthScore: 84,
  lastBuiltAt: '2026-05-12T07:00:00.000Z',
  lastSnapshotAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
  lastSeenNextActionId: 'STALE_SOURCE_ID_TO_TRIGGER_FRESH_HALO',
  updatedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
};

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[presence] Base: ${BASE}`);
  console.log(`[presence] Out:  ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const entries = [];

  const captureSeeded = async (slug, seed, label) => {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      seededMemory: JSON.stringify(seed),
      label: 'safe',
    });
    const page = await ctx.newPage();
    console.log(`[presence] ${slug}  (${label})`);
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const out = path.join(OUT_DIR, `${slug}.png`);
    const shotInfo = await safeScreenshot(page, out, { fullPage: false, label: 'safe' });
    entries.push({
      slug,
      label,
      file: path.basename(out),
      originalWidth: shotInfo.originalWidth,
      finalWidth: shotInfo.finalWidth,
      downscaled: shotInfo.downscaled,
    });
    await ctx.close();
  };

  await captureSeeded('cory-home-with-forward-deltas', FORWARD_SEED, 'forward deltas — green chips, ↗ chevrons, fresh halo');
  await captureSeeded('cory-home-with-backward-deltas', BACKWARD_SEED, 'backward deltas — red ↓ chips');

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);
  console.log(`[presence] Done. ${entries.length} variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
