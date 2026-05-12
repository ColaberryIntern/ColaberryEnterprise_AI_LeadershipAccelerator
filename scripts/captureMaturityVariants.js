/**
 * captureMaturityVariants.js
 *
 * System Surface Maturity Sprint, 2026-05-12.
 *
 * Captures the BPs tab in three states: collapsed (default editorial
 * view), one domain expanded, and "show full inventory" toggled (the
 * legacy dense grid behind one click). Plus a route-cleanup proof
 * showing /portal/project/system-v2 redirecting to /portal/project/system.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-maturity-variants`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[maturity] Out: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const baseCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    if (TOKEN) await ctx.addInitScript((tok) => { try { window.localStorage.setItem('participant_token', tok); } catch {} }, TOKEN);
    return ctx;
  };

  // 1. BPs tab — default collapsed editorial view
  {
    const ctx = await baseCtx();
    const page = await ctx.newPage();
    console.log('[maturity] 01-bps-domain-collapsed');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT_DIR, '01-bps-domain-collapsed.png'), fullPage: false });
    await ctx.close();
  }

  // 2. BPs tab — first domain expanded
  {
    const ctx = await baseCtx();
    const page = await ctx.newPage();
    console.log('[maturity] 02-bps-domain-expanded');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Click the first domain row button
    await page.click('section button[aria-expanded="false"]').catch(e => console.log('  expand click failed:', e.message));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT_DIR, '02-bps-domain-expanded.png'), fullPage: false });
    await ctx.close();
  }

  // 3. BPs tab — show full inventory toggled (legacy density)
  {
    const ctx = await baseCtx();
    const page = await ctx.newPage();
    console.log('[maturity] 03-bps-full-inventory');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.click('button:has-text("Show full inventory")').catch(e => console.log('  inventory click failed:', e.message));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT_DIR, '03-bps-full-inventory.png'), fullPage: false });
    await ctx.close();
  }

  // 4. Route cleanup proof — visit /system-v2 and screenshot URL after redirect
  {
    const ctx = await baseCtx();
    const page = await ctx.newPage();
    console.log('[maturity] 04-route-redirect-proof');
    await page.goto(`${BASE}/portal/project/system-v2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    console.log(`  final URL after visiting /system-v2: ${finalUrl}`);
    await page.screenshot({ path: path.join(OUT_DIR, '04-route-redirect-proof.png'), fullPage: false });
    fs.writeFileSync(path.join(OUT_DIR, '04-route-redirect-proof.json'), JSON.stringify({
      requested: `${BASE}/portal/project/system-v2`,
      landed_on: finalUrl,
      redirected: !finalUrl.includes('system-v2'),
    }, null, 2));
    await ctx.close();
  }

  await browser.close();
  console.log(`[maturity] Done. 4 variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
