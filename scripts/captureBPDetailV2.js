/**
 * captureBPDetailV2.js
 *
 * BP V2 Detail Modal Sprint, 2026-05-12.
 *
 * Navigates to the BPs tab, opens the auto-expanded first BP, and
 * screenshots the new BPDetailV2 modal in two states:
 *   1. Detail open on a BP with no requirements yet
 *   2. Detail open on a BP with requirements (Lead Management style)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-bp-detail-v2`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[bp-detail-v2] Out: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });

  const opener = async (slug, label, bpNameRegex) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    if (TOKEN) await ctx.addInitScript((t) => { try { window.localStorage.setItem('participant_token', t); } catch {} }, TOKEN);
    const page = await ctx.newPage();
    console.log(`[bp-detail-v2] ${slug}  (${label})`);
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    // Expand every collapsed domain so the target BP is reachable
    const expanders = await page.$$('section button[aria-expanded="false"]');
    for (const e of expanders) {
      try { await e.click(); await page.waitForTimeout(80); } catch {}
    }
    await page.waitForTimeout(400);
    // Click the BP whose name matches the regex
    const clicked = await page.evaluate((rxSource) => {
      const re = new RegExp(rxSource, 'i');
      const rows = Array.from(document.querySelectorAll('section button'));
      for (const r of rows) {
        const span = r.querySelector('span');
        if (!span) continue;
        const txt = (span.textContent || '').trim();
        if (re.test(txt)) {
          r.click();
          return txt;
        }
      }
      return null;
    }, bpNameRegex);
    console.log(`  clicked BP: ${clicked || '(none — falling back to fullPage)'}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT_DIR, `${slug}.png`), fullPage: false });
    await ctx.close();
  };

  // 1. Dataset Registration (no requirements, Foundational tone)
  await opener('01-detail-foundational', 'Dataset Registration', 'Dataset Registration');

  // 2. Lead Management (has features, more substance)
  await opener('02-detail-lead-management', 'Lead Management', 'Lead Management');

  await browser.close();
  console.log(`[bp-detail-v2] Done. 2 detail variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
