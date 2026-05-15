/**
 * captureExecutiveSignalLayering.js
 *
 * Executive Signal Layering Sprint, 2026-05-15.
 *
 * Captures the new scan-speed metadata strip on production:
 *   01. System BPs full surface — multiple collapsed rows showing the
 *       metadata strip across domains
 *   02. Focused crop of one collapsed DomainRow header — proves the
 *       strip is visible WITHOUT expanding
 *   03. Focused crop showing 3 stacked rows so the eye can scan
 *       completion + downstream across domains at once
 *   04. Cory Home — verify no regression (tiles untouched)
 *
 * Viewport 1440x1500 at deviceScaleFactor=1 — under the 2000px limit.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-executive-signal-layering`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[signals] Out: ${OUT_DIR}`);
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

  // ── 01–03: System BPs surface with scan-speed strip ──────────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[signals] 01-system-bps-with-scan-strip');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-system-bps-with-scan-strip.png'), fullPage: false });

    // Crop the first collapsed DomainRow header so the strip is undeniably
    // visible without the row being expanded. Walk to the second domain
    // (the first auto-expands) and grab just its header area.
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('section'))
        .filter((s) => s.querySelector('button[aria-expanded]'))
        .map((s, i) => {
          const r = s.getBoundingClientRect();
          const expanded = s.querySelector('button[aria-expanded="true"]') != null;
          return { i, top: r.top + window.scrollY, expanded };
        });
    });
    // Find first COLLAPSED row (skip the auto-expanded first one)
    const collapsedTarget = rows.find((r) => !r.expanded);
    if (collapsedTarget) {
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 40), behavior: 'instant' }), collapsedTarget.top);
      await page.waitForTimeout(400);
      // Crop just the header area (top ~140px of the row)
      const rowBox = await page.evaluate((idx) => {
        const s = Array.from(document.querySelectorAll('section'))
          .filter((el) => el.querySelector('button[aria-expanded]'))[idx];
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(170, Math.ceil(r.height + 8)) };
      }, collapsedTarget.i);
      if (rowBox) {
        await page.screenshot({ path: path.join(OUT_DIR, '02-collapsed-row-with-metadata-strip.png'), clip: rowBox });
        console.log('  cropped collapsed row header at', rowBox);
      }
    } else {
      console.log('  [warn] no collapsed row found');
    }

    // 3 stacked rows for scan-speed demo
    const stackBox = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section'))
        .filter((el) => el.querySelector('button[aria-expanded]'));
      if (sections.length < 3) return null;
      // Pick 3 collapsed rows in sequence
      const collapsed = sections.filter((s) => !s.querySelector('button[aria-expanded="true"]'));
      if (collapsed.length < 3) return null;
      const first = collapsed[0].getBoundingClientRect();
      const last = collapsed[2].getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(first.left - 4)),
        y: Math.max(0, Math.floor(first.top - 4)),
        width: Math.ceil(first.width + 8),
        height: Math.ceil(last.bottom - first.top + 8),
      };
    });
    if (stackBox && stackBox.height < 1500) {
      // Scroll first row into top so the stack fits in viewport
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 20), behavior: 'instant' }), stackBox.y);
      await page.waitForTimeout(400);
      // Re-resolve after scroll
      const adjusted = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll('section'))
          .filter((el) => el.querySelector('button[aria-expanded]'));
        const collapsed = sections.filter((s) => !s.querySelector('button[aria-expanded="true"]'));
        if (collapsed.length < 3) return null;
        const first = collapsed[0].getBoundingClientRect();
        const last = collapsed[2].getBoundingClientRect();
        return {
          x: Math.max(0, Math.floor(first.left - 4)),
          y: Math.max(0, Math.floor(first.top - 4)),
          width: Math.ceil(first.width + 8),
          height: Math.ceil(last.bottom - first.top + 8),
        };
      });
      if (adjusted && adjusted.height > 0 && adjusted.y >= 0 && adjusted.y + adjusted.height <= 1500) {
        await page.screenshot({ path: path.join(OUT_DIR, '03-three-rows-scan-stack.png'), clip: adjusted });
        console.log('  cropped 3-row stack at', adjusted);
      }
    }
    await ctx.close();
  }

  // ── 04: Cory Home regression check ────────────────────────────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[signals] 04-home-regression-check');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '04-home-no-regression.png'), fullPage: false });
    await ctx.close();
  }

  await browser.close();
  console.log(`[signals] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
