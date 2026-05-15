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
 * Captures use viewport 1440x900 at deviceScaleFactor=1 so every PNG stays
 * comfortably under the 2000px many-image dimension limit — the prior
 * sprint's session got stuck because a retina full-page capture exceeded it.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operator-orientation`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

const FOCUS_DOMAIN_LABEL = 'Lead Intelligence';

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[orient] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });

  // addInitScript fires on EVERY navigation in the context, so it must
  // only contain side effects that are safe to repeat. Setting the token
  // and (optionally) seeding memory to a known shape is safe. A blanket
  // removal would wipe state the previous page just wrote — which is
  // exactly what we want to preserve across navigations in capture 02.
  const makeContext = async (seededMemory) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1 });
    if (TOKEN) {
      await ctx.addInitScript(({ t, seeded }) => {
        try {
          window.localStorage.setItem('participant_token', t);
          if (seeded) window.localStorage.setItem('workspaceMemory:v1', seeded);
        } catch (_e) { /* localStorage unavailable in some contexts */ }
      }, { t: TOKEN, seeded: seededMemory || null });
    }
    return ctx;
  };

  // Clear continuity memory + per-session dismissals in the live document.
  // Used at the start of a capture that needs an empty-state Home; runs
  // once, not on every navigation.
  const clearMemoryLive = async (page) => {
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem('workspaceMemory:v1');
        window.localStorage.removeItem('continuationCard:dismissed');
        window.sessionStorage.removeItem('continuationCard:dismissed');
      } catch (_e) { /* ignore */ }
    });
  };

  // ── 01. Home, no focus signal (control) ────────────────────────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[orient] 01-home-no-focus');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await clearMemoryLive(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-home-no-focus.png'), fullPage: false });
    await ctx.close();
  }

  // ── 02. Home, after engaging Lead Intelligence on System ──────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[orient] 02-home-with-focus');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await clearMemoryLive(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    // Click the Lead Intelligence flow strip stop (or the first stop if
    // Lead Intelligence isn't present in this project).
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
    await page.waitForTimeout(1800); // let pulse finish + memory write settle

    // Verify the write landed before navigating back.
    const persisted = await page.evaluate(() => window.localStorage.getItem('workspaceMemory:v1'));
    console.log('  memory after click:', persisted ? persisted.slice(0, 140) + '…' : '(empty)');

    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '02-home-with-focus.png'), fullPage: false });

    // Also crop the OperatorFocusCard for the review doc — find it by aria-label
    const cardBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Your operational focus"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 8)), y: Math.max(0, Math.floor(r.top - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) };
    });
    if (cardBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '04-operator-focus-card-crop.png'), clip: cardBox });
      console.log('  cropped OperatorFocusCard at', cardBox);
    } else {
      console.log('  [warn] OperatorFocusCard not found in DOM — focus signal may not have stuck');
    }
    await ctx.close();
  }

  // ── 03. Home, with focus + seeded lastContribution ─────────────────────
  // To demonstrate the new "Last improvement" piece on the history strip,
  // pre-seed workspaceMemory with a focus domain + a recent contribution.
  // Honest seeding — same shape the live CoryHome leave-handler writes.
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
    const ctx = await makeContext(JSON.stringify(seeded));
    const page = await ctx.newPage();
    console.log('[orient] 03-home-with-contribution');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '03-home-with-contribution.png'), fullPage: false });

    // Focused crop of the OperationalHistoryStrip showing the new
    // "Last improvement" piece. Scroll it into view first so it sits
    // squarely in the viewport rather than below the fold.
    const stripBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational history"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 24)), y: Math.max(0, Math.floor(r.top - 12)), width: Math.min(1440, Math.ceil(r.width + 48)), height: Math.ceil(r.height + 24) };
    });
    if (stripBox) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT_DIR, '05-history-strip-crop.png'), clip: stripBox });
      console.log('  cropped OperationalHistoryStrip at', stripBox);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`[orient] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
