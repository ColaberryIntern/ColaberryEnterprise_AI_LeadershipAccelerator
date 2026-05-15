/**
 * captureOperationalLeverage.js
 *
 * Operational Leverage Sprint, 2026-05-15.
 *
 * Captures the leverage surfaces on production:
 *   01. System BPs — editorial "Operational leverage" headline above the
 *       domain stack (full surface)
 *   02. Focused crop of the headline alone
 *   03. Focused crop of a domain row showing the new forwardLookingNote
 *       (blue) alongside the existing pressureNote (amber)
 *   04. Cory Home with a seeded leverageSummary — shows the footer line
 *       on OperatorFocusCard pointing to a different domain
 *   05. Focused crop of the OperatorFocusCard footer
 *
 * Viewport 1440x1500 at deviceScaleFactor=1 — output stays under the
 * 2000px many-image limit.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operational-leverage`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[leverage] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });

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

  // ── 01 + 02 + 03: System BPs surface with leverage layer ──────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[leverage] 01-system-bps-leverage');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000); // let BPs + classifier settle
    await page.screenshot({ path: path.join(OUT_DIR, '01-system-bps-leverage.png'), fullPage: false });

    // Crop the leverage headline alone
    const headlineBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational leverage"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 8)), y: Math.max(0, Math.floor(r.top - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) };
    });
    if (headlineBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '02-leverage-headline-crop.png'), clip: headlineBox });
      console.log('  cropped leverage headline at', headlineBox);
    } else {
      console.log('  [warn] leverage headline not found — score may be below the threshold for this project');
    }

    // Find a domain row that has BOTH a pressureNote AND a forward-looking
    // note, expand it (if not already), and crop. The row markup carries
    // both italic lines inside the same flex column.
    const rowBox = await page.evaluate(() => {
      // Look for the amber bi-exclamation-circle icon (pressureNote marker)
      // and the blue bi-arrow-down-right-circle (forwardLookingNote marker).
      const rows = Array.from(document.querySelectorAll('section'));
      for (const row of rows) {
        const hasPressure = row.querySelector('.bi-exclamation-circle');
        const hasForward = row.querySelector('.bi-arrow-down-right-circle');
        if (hasPressure && hasForward) {
          const r = row.getBoundingClientRect();
          return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(220, Math.ceil(r.height + 8)) };
        }
      }
      return null;
    });
    if (rowBox) {
      // Scroll the row into view first, then re-resolve the box.
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 80), behavior: 'instant' }), rowBox.y);
      await page.waitForTimeout(400);
      const adjusted = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('section'));
        for (const row of rows) {
          if (row.querySelector('.bi-exclamation-circle') && row.querySelector('.bi-arrow-down-right-circle')) {
            const r = row.getBoundingClientRect();
            return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(260, Math.ceil(r.height + 8)) };
          }
        }
        return null;
      });
      if (adjusted) {
        await page.screenshot({ path: path.join(OUT_DIR, '03-domain-row-forward-note.png'), clip: adjusted });
        console.log('  cropped domain row with both notes at', adjusted);
      }
    } else {
      console.log('  [warn] no domain row with both pressure + forward notes found — leverage map may be sparse here');
    }
    await ctx.close();
  }

  // ── 04 + 05: Home with seeded focus + leverage summary ────────────────
  {
    const seeded = {
      // Operator was last shaping Intake (focus signal)
      lastBpDomain: 'intake',
      lastBpDomainLabel: 'Intake & Registration',
      lastBpDomainAt: new Date(Date.now() - 8 * 60_000).toISOString(),
      // System-level observation cached on leave from a prior System visit
      // — points to Lead Intelligence (different from the focus domain so
      // the footer renders).
      lastLeverageSummary: {
        highestLeverageLabel: 'Lead Intelligence',
        reason: 'broadest_surface',
        evolutionPhrase: 'Your operational system is in early coordination — the through-lines are forming but maturity is uneven.',
        at: new Date(Date.now() - 25 * 60_000).toISOString(),
      },
      lastSnapshotAt: new Date(Date.now() - 50 * 60_000).toISOString(),
      lastReadinessScore: 60,
      lastCoverageScore: 50,
      lastQueueSize: 12,
      lastHealthScore: 80,
    };
    const ctx = await makeContext(JSON.stringify(seeded));
    const page = await ctx.newPage();
    console.log('[leverage] 04-home-with-leverage-summary');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '04-home-with-leverage-summary.png'), fullPage: false });

    // Crop the OperatorFocusCard alone — now extended with the leverage footer.
    const cardBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Your operational focus"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 8)), y: Math.max(0, Math.floor(r.top - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) };
    });
    if (cardBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '05-focus-card-with-leverage-footer.png'), clip: cardBox });
      console.log('  cropped OperatorFocusCard with leverage footer at', cardBox);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`[leverage] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
