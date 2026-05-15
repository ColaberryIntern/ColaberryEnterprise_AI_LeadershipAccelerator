/**
 * captureOperationalPriorityTopology.js
 *
 * Operational Priority Topology Sprint, 2026-05-15.
 *
 * Captures the new System BPs surface:
 *   01. Full surface — flow strip gone, leverage block carries the
 *       "Why this matters" line, domain stack reordered by priority
 *   02. Focused crop of the leverage block with the new Why-this-matters
 *       sentence
 *   03. Focused crop of the Cory-priority domain row (with badge + accent)
 *   04. Focused crop of a downstream domain row (subtler accent border)
 *   05. BP-line word softening — focused crop of an expanded row's
 *       processes list showing "Not built yet" / "Forming" / "Usable"
 *       sentence-case treatment
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
  `${new Date().toISOString().slice(0, 10)}-operational-priority-topology`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[priority] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });

  const makeContext = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1 });
    if (TOKEN) {
      await ctx.addInitScript((t) => {
        try { window.localStorage.setItem('participant_token', t); } catch (_e) { /* ignore */ }
      }, TOKEN);
    }
    return ctx;
  };

  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[priority] 01-system-bps-no-flow-strip');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-system-bps-no-flow-strip.png'), fullPage: false });

    // Leverage block with "Why this matters" sub-line
    const leverageBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational leverage"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 8)), y: Math.max(0, Math.floor(r.top - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) };
    });
    if (leverageBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '02-leverage-with-why-this-matters.png'), clip: leverageBox });
      console.log('  cropped leverage block at', leverageBox);
    } else {
      console.log('  [warn] leverage block not found');
    }

    // Cory-priority row — find the section that contains the "CURRENT PRIORITY" badge text
    const priorityBox = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section'));
      for (const s of sections) {
        if ((s.textContent || '').includes('Current priority')) {
          const r = s.getBoundingClientRect();
          return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(220, Math.ceil(r.height + 8)) };
        }
      }
      return null;
    });
    if (priorityBox) {
      // Scroll the priority row into the upper viewport for clean crop
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 40), behavior: 'instant' }), priorityBox.y);
      await page.waitForTimeout(400);
      const adjusted = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('section'));
        for (const s of sections) {
          if ((s.textContent || '').includes('Current priority')) {
            const r = s.getBoundingClientRect();
            return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(260, Math.ceil(r.height + 8)) };
          }
        }
        return null;
      });
      if (adjusted) {
        await page.screenshot({ path: path.join(OUT_DIR, '03-cory-priority-row.png'), clip: adjusted });
        console.log('  cropped Cory-priority row at', adjusted);
      }
    } else {
      console.log('  [info] no CURRENT PRIORITY badge found — Cory next_action did not map to a BP in this project');
    }

    // Downstream row — heuristic: the SECOND section (after the priority
    // row, which is now sorted first). Should carry the muted-primary
    // accent if priority + downstream logic fired.
    const secondRowBox = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section')).filter(s => s.querySelector('button[aria-expanded]'));
      if (sections.length < 2) return null;
      const s = sections[1];
      const r = s.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(220, Math.ceil(r.height + 8)) };
    });
    if (secondRowBox) {
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 40), behavior: 'instant' }), secondRowBox.y);
      await page.waitForTimeout(400);
      const adjusted = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('section')).filter(s => s.querySelector('button[aria-expanded]'));
        if (sections.length < 2) return null;
        const s = sections[1];
        const r = s.getBoundingClientRect();
        return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(240, Math.ceil(r.height + 8)) };
      });
      if (adjusted) {
        await page.screenshot({ path: path.join(OUT_DIR, '04-second-row-context.png'), clip: adjusted });
        console.log('  cropped second row at', adjusted);
      }
    }

    // BP-line word softening — capture the expanded first domain so the
    // sentence-case "Not built yet" / "Forming" / etc. shows.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, '05-softened-bp-line-words.png'), fullPage: false });
    console.log('  captured softened BP-line context (full surface, first domain auto-expanded)');

    await ctx.close();
  }

  await browser.close();
  console.log(`[priority] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
