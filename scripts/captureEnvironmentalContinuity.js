/**
 * captureEnvironmentalContinuity.js
 *
 * Environmental Continuity Sprint, 2026-05-15.
 *
 * The point of this capture is to show that the operator's focus signal
 * — "shaping Lead Intelligence" — travels across every surface in the
 * persistent context bar. We seed workspace memory with a focus
 * domain, then screenshot the same bar appearing identically on Home,
 * Critique, Blueprint, and System.
 *
 *   01. Home — context bar carries "shaping Lead Intelligence"
 *   02. Critique — same bar, same focus line
 *   03. Blueprint — same bar, same focus line
 *   04. System — same bar, same focus line
 *   05. Focused crop of the bar alone (proves the persistent slot)
 *   06. Home + System container rhythm side-by-side: same max-width
 *       and top padding now share visual cadence
 *
 * Viewport 1440x1500 at deviceScaleFactor=1.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-environmental-continuity`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

const SEEDED_MEMORY = {
  lastBpDomain: 'lead_intelligence',
  lastBpDomainLabel: 'Lead Intelligence',
  lastBpDomainAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastSnapshotAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  lastReadinessScore: 30,
  lastCoverageScore: 47,
  lastQueueSize: 1,
  lastHealthScore: 60,
};

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[continuity] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });

  const makeContext = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    if (TOKEN) {
      await ctx.addInitScript(({ t, seeded }) => {
        try {
          window.localStorage.setItem('participant_token', t);
          window.localStorage.setItem('workspaceMemory:v1', seeded);
        } catch (_e) { /* ignore */ }
      }, { t: TOKEN, seeded: JSON.stringify(SEEDED_MEMORY) });
    }
    return ctx;
  };

  const surfaces = [
    { key: '01-home', path: '/portal/home' },
    { key: '02-critique', path: '/portal/visual-workspace' },
    { key: '03-blueprint', path: '/portal/project/blueprint' },
    { key: '04-system', path: '/portal/project/system?tab=bps' },
  ];

  // Capture each surface — same persistent bar carries "shaping Lead Intelligence" everywhere.
  for (const s of surfaces) {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log(`[continuity] ${s.key}`);
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, `${s.key}-bar-continuity.png`), fullPage: false });
    await ctx.close();
  }

  // Focused crop of the bar alone, captured from Home for clarity.
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[continuity] 05-bar-crop');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const barBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Workspace context"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: 0, y: Math.max(0, Math.floor(r.top - 4)), width: Math.min(1440, Math.ceil(r.right + 4)), height: Math.ceil(r.height + 8) };
    });
    if (barBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '05-bar-crop.png'), clip: barBox });
      console.log('  cropped bar at', barBox);
    } else {
      console.log('  [warn] bar not found');
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`[continuity] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
