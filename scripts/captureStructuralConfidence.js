/**
 * captureStructuralConfidence.js
 *
 * Structural Confidence Sprint, 2026-05-15.
 *
 * Captures the new confidence-language surfaces on production:
 *   01. System BPs — domain rows with softened trust labels + per-domain
 *       confidence lines + sturdier system-resilience phrasing
 *   02. Focused crop of one domain row showing the trust badge ("Still
 *       forming" / "Coordinating" / etc.) AND the new italic confidence
 *       sentence inline with the narrative
 *   03. Focused crop of the leverage block's resilience sub-line
 *   04. Cory Home — restrained tile values (22px instead of 28px) so the
 *       editorial band label reads as peer of the number
 *   05. Focused crop of the 3-tile row alone
 *
 * Viewport 1440x1500 at deviceScaleFactor=1 — output stays under the
 * 2000px many-image dimension limit.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-structural-confidence`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[confidence] Out: ${OUT_DIR}`);
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

  // ── 01–03: System BPs surface with trust labels + confidence lines ────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[confidence] 01-system-bps-confidence');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-system-bps-confidence.png'), fullPage: false });

    // Crop the leverage block alone (carries the new sturdier resilience sub-line)
    const leverageBox = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational leverage"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 8)), y: Math.max(0, Math.floor(r.top - 8)), width: Math.ceil(r.width + 16), height: Math.ceil(r.height + 16) };
    });
    if (leverageBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '03-leverage-with-resilience.png'), clip: leverageBox });
      console.log('  cropped leverage block at', leverageBox);
    }

    // Crop the first DomainRow. DomainRows are <section> elements that
    // wrap a header <button aria-expanded="..."> — that's distinctive
    // enough to skip any unrelated sections higher in the DOM.
    const rowSel = 'section:has(button[aria-expanded])';
    const rowMeta = await page.evaluate((sel) => {
      const s = document.querySelector(sel);
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { top: r.top + window.scrollY };
    }, rowSel);
    if (rowMeta) {
      await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y - 40), behavior: 'instant' }), rowMeta.top);
      await page.waitForTimeout(400);
      const rowBox = await page.evaluate((sel) => {
        const s = document.querySelector(sel);
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.min(320, Math.ceil(r.height + 8)) };
      }, rowSel);
      if (rowBox) {
        await page.screenshot({ path: path.join(OUT_DIR, '02-domain-row-trust-label-and-confidence.png'), clip: rowBox });
        console.log('  cropped first DomainRow at', rowBox);
      }
    } else {
      console.log('  [warn] no DomainRow found via section:has(button[aria-expanded])');
    }
    await ctx.close();
  }

  // ── 04 + 05: Cory Home with restrained tiles ─────────────────────────
  {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    console.log('[confidence] 04-home-restrained-tiles');
    await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '04-home-restrained-tiles.png'), fullPage: false });

    // Crop just the 3-tile row. Tiles are <button>s with label "Readiness"
    // / "Coverage" / "Health" — find their wrapping .row.
    const tileBox = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('div'))
        .filter((d) => /^Readiness$/.test((d.textContent || '').trim()));
      if (headings.length === 0) return null;
      // Walk up until we hit the row containing all 3 tiles
      let node = headings[0];
      while (node && node.parentElement && !node.classList.contains('row')) {
        node = node.parentElement;
      }
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(r.left - 4)), y: Math.max(0, Math.floor(r.top - 4)), width: Math.ceil(r.width + 8), height: Math.ceil(r.height + 8) };
    });
    if (tileBox) {
      await page.screenshot({ path: path.join(OUT_DIR, '05-tiles-row-crop.png'), clip: tileBox });
      console.log('  cropped tile row at', tileBox);
    } else {
      console.log('  [warn] tile row not found');
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`[confidence] Done. Captures in ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
