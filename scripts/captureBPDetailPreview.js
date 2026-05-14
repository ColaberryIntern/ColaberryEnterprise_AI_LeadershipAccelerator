/**
 * captureBPDetailPreview.js
 *
 * BP Detail Live Preview Sprint, 2026-05-12.
 *
 * Captures the new BPDetailV2 modal opened on a Page BP so the
 * embedded iframe + Critique/Upgrade actions are visible. Two captures:
 *   1. AI Architect Landing Page — Page BP with frontend_route, iframe
 *      shows the live production page
 *   2. (fallback) Any other Page BP if AI Architect can't be found
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-bp-detail-preview`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[bp-preview] Out: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });

  const opener = async (slug, label, bpNameRegex) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
    if (TOKEN) await ctx.addInitScript((t) => { try { window.localStorage.setItem('participant_token', t); } catch {} }, TOKEN);
    const page = await ctx.newPage();
    console.log(`[bp-preview] ${slug}  (${label})`);
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    // Expand every collapsed domain so the target BP is reachable
    const expanders = await page.$$('section button[aria-expanded="false"]');
    for (const e of expanders) {
      try { await e.click(); await page.waitForTimeout(80); } catch {}
    }
    await page.waitForTimeout(400);
    // Click the BP whose name contains the regex (substring, not anchored).
    // Scan every span across every section button — picks up both the
    // domain title spans (skipped) and the BPLine name spans.
    const clicked = await page.evaluate((rxSource) => {
      const re = new RegExp(rxSource, 'i');
      const rows = Array.from(document.querySelectorAll('section button'));
      const debug = [];
      for (const r of rows) {
        // BPLine has the name as the first inline span (flex:1)
        const spans = Array.from(r.querySelectorAll('span'));
        for (const span of spans) {
          const txt = (span.textContent || '').trim();
          if (!txt) continue;
          debug.push(txt.slice(0, 50));
          if (re.test(txt)) {
            r.click();
            return { matched: txt };
          }
        }
      }
      return { matched: null, debug: debug.slice(0, 20) };
    }, bpNameRegex);
    console.log(`  evaluate result:`, JSON.stringify(clicked).slice(0, 240));
    console.log(`  clicked BP: ${clicked || '(none)'}`);
    // Wait long enough for the iframe to load the live page
    await page.waitForTimeout(4500);
    await page.screenshot({ path: path.join(OUT_DIR, `${slug}.png`), fullPage: false });
    await ctx.close();
  };

  // Target Page BPs with source='frontend_page' — these carry a real
  // frontend_route, so the embedded live-preview iframe renders.
  await opener('01-program-page-preview', 'Program Page', '^Program Page$');
  await opener('02-pricing-page-preview', 'Pricing Page', '^Pricing Page$');

  await browser.close();
  console.log(`[bp-preview] Done. 2 captures saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
