/**
 * captureContinuityVariants.js
 *
 * Continuity + Resume Flow Sprint, 2026-05-12.
 *
 * Pre-seeds localStorage with continuity signals before navigating to
 * /portal/home, so the ContinuationCard renders for each meaningful
 * scenario. Also captures SystemView with memory.lastSystemTab to prove
 * tab restoration lands the operator on a non-default tab.
 *
 * Outputs to docs/screenshots/<YYYY-MM-DD>-continuity-variants/
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-continuity-variants`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

// Each variant seeds different memory + session signals.
const SCENARIOS = [
  {
    slug: '01-home-resume-coverage-drawer',
    label: 'Resume last drawer (Coverage)',
    route: '/portal/home',
    memory: {
      lastVisitedSurface: 'home',
      lastDrawerOpen: 'coverage',
      lastReadinessScore: 36,
      lastCoverageScore: 44,
      lastQueueSize: 2,
      lastHealthScore: 78,
      lastBuiltAt: '2026-05-12T07:00:00.000Z',
      lastSnapshotAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    },
    sessionStorage: {},
  },
  {
    slug: '02-home-resume-critique-handoff',
    label: 'Resume critique handoff',
    route: '/portal/home',
    memory: {
      lastVisitedSurface: 'home',
      lastReadinessScore: 38,
      lastCoverageScore: 47,
      lastQueueSize: 1,
      lastHealthScore: 80,
      lastBuiltAt: '2026-05-12T07:00:00.000Z',
      lastSnapshotAt: new Date(Date.now() - 8 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
    sessionStorage: {
      'visualWorkspace:pendingBuildPrompt': '# Mock compiled critique prompt\n\nFix the page header spacing on /portal/home',
      'visualWorkspace:pendingBuildSourceRoute': '/portal/home',
      'visualWorkspace:lastSessionTouchedAt': new Date(Date.now() - 12 * 60_000).toISOString(),
    },
  },
  {
    slug: '03-home-resume-system-tab',
    label: 'Resume last System tab (architecture)',
    route: '/portal/home',
    memory: {
      lastVisitedSurface: 'system',
      lastSystemTab: 'architecture',
      lastBpId: 'bp-auth-pipeline-fake-uuid',
      lastReadinessScore: 38,
      lastCoverageScore: 47,
      lastQueueSize: 1,
      lastHealthScore: 80,
      lastBuiltAt: '2026-05-12T07:00:00.000Z',
      lastSnapshotAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    },
    sessionStorage: {},
  },
  {
    slug: '04-home-arrival-toast-momentum',
    label: 'Arrival ack toast (forward momentum)',
    route: '/portal/home',
    memory: {
      lastVisitedSurface: 'home',
      lastReadinessScore: 30,
      lastCoverageScore: 40,
      lastQueueSize: 4,
      lastHealthScore: 70,
      lastBuiltAt: '2026-05-12T05:00:00.000Z',
      lastSnapshotAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    },
    sessionStorage: {},
    extraWaitMs: 800,  // wait for toast to materialize
  },
  {
    slug: '05-system-tab-restored-from-memory',
    label: 'SystemView lands on bps tab restored from memory',
    route: '/portal/project/system',  // no ?tab= — memory should restore
    memory: {
      lastVisitedSurface: 'system',
      lastSystemTab: 'bps',
    },
    sessionStorage: {},
    extraWaitMs: 2000,  // BPs tab fetches processes
  },
  {
    slug: '06-system-tab-restored-architecture',
    label: 'SystemView lands on architecture tab restored from memory',
    route: '/portal/project/system',
    memory: {
      lastVisitedSurface: 'system',
      lastSystemTab: 'architecture',
    },
    sessionStorage: {},
    extraWaitMs: 1500,
  },
];

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[continuity] Base: ${BASE}`);
  console.log(`[continuity] Out:  ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });

  for (const s of SCENARIOS) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript(({ tok, memory, sess }) => {
      try {
        if (tok) window.localStorage.setItem('participant_token', tok);
        window.localStorage.setItem('workspaceMemory:v1', JSON.stringify(memory));
        Object.entries(sess || {}).forEach(([k, v]) => {
          window.sessionStorage.setItem(k, v);
        });
      } catch { /* ignore */ }
    }, { tok: TOKEN, memory: s.memory, sess: s.sessionStorage });

    const page = await ctx.newPage();
    console.log(`[continuity] ${s.slug}  (${s.label})`);
    await page.goto(`${BASE}${s.route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(s.extraWaitMs ?? 2500);
    await page.screenshot({ path: path.join(OUT_DIR, `${s.slug}.png`), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  console.log(`[continuity] Done. ${SCENARIOS.length} variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
