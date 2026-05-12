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
 * Output → docs/screenshots/<YYYY-MM-DD>-presence-variants/
 *
 * Captures:
 *   1. cory-home-with-deltas.png        — RecentlyMovedCard + tile chevrons visible
 *   2. cory-home-with-deltas-backwards.png — same but with backward deltas (red ↓ chips)
 *   3. cory-home-fresh-priority.png     — ws-fresh halo on priority card (clean lastSeenNextActionId mismatch)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-presence-variants`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

// Prior-snapshot values to seed memory with. The live state at capture
// time appears to be readiness=38, coverage=47, queue=1, health=80.
// Seed values are chosen so each direction is exercised:
//   forward variant   : readiness was 34 (+4), coverage was 45 (+2), queue was 4 (-3), health was 78 (+2)
//   backward variant  : readiness was 44 (-6), coverage was 51 (-4), queue was 0 (+1), health was 84 (-4)
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

const NO_FRESH_SEED = {
  ...FORWARD_SEED,
  // Match the actual current id so the priority card does NOT halo.
  // We can't know the id without reading state — so leave undefined,
  // which means it'll match nothing and the halo fires. The two
  // forward/backward variants both demonstrate the halo; this one is
  // just here as a reference for "halo OFF" comparison.
};

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[presence] Base: ${BASE}`);
  console.log(`[presence] Out:  ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });

  const captureSeeded = async (slug, seed, label) => {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    // Inject token + memory seed before any script runs
    await ctx.addInitScript(({ tok, seed }) => {
      try {
        if (tok) window.localStorage.setItem('participant_token', tok);
        window.localStorage.setItem('workspaceMemory:v1', JSON.stringify(seed));
      } catch { /* ignore */ }
    }, { tok: TOKEN, seed });

    const page = await ctx.newPage();
    console.log(`[presence] ${slug}  (${label})`);
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    // Give the state poll + memory snapshot guard time to settle
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, `${slug}.png`), fullPage: false });
    await ctx.close();
  };

  await captureSeeded('cory-home-with-forward-deltas', FORWARD_SEED, 'forward deltas — green chips, ↗ chevrons, fresh halo');
  await captureSeeded('cory-home-with-backward-deltas', BACKWARD_SEED, 'backward deltas — red ↓ chips');

  await browser.close();
  console.log(`[presence] Done. 2 variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
