/**
 * captureBPv2Variants.js
 *
 * BP V2 Operational Architecture Sprint, 2026-05-12.
 *
 * Captures BPs surface in three meaningful states:
 *   1. Default (auto-expanded first domain) — proves the first-domain
 *      auto-expand behavior
 *   2. All domains expanded — proves the full architecture map
 *   3. Seeded with prior momentum snapshot — proves the ↑/↓ momentum
 *      chip rendering vs the lifecycle pill
 *   4. Flow strip detail — top-of-surface crop showing the editorial
 *      header + flow strip rhythm
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-bp-v2-variants`,
);
const TOKEN = process.env.CAPTURE_TOKEN
  || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, 'utf8').trim() : null);

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[bp-v2] Out: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const ctxFactory = async (initMomentum) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(({ tok, momentum }) => {
      try {
        if (tok) window.localStorage.setItem('participant_token', tok);
        if (momentum) {
          window.localStorage.setItem('bpDomainMomentum:v1', JSON.stringify(momentum));
        }
      } catch { /* ignore */ }
    }, { tok: TOKEN, momentum: initMomentum });
    return ctx;
  };

  // 1. Default state — first domain auto-expanded
  {
    const ctx = await ctxFactory(null);
    const page = await ctx.newPage();
    console.log('[bp-v2] 01-default-auto-expanded');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-default-auto-expanded.png'), fullPage: false });
    await ctx.close();
  }

  // 2. All domains expanded — full architecture map
  {
    const ctx = await ctxFactory(null);
    const page = await ctx.newPage();
    console.log('[bp-v2] 02-all-expanded');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    // Click every collapsed expand button
    const rows = await page.$$('section button[aria-expanded="false"]');
    for (const r of rows) {
      try { await r.click(); await page.waitForTimeout(150); } catch {}
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT_DIR, '02-all-expanded.png'), fullPage: true });
    await ctx.close();
  }

  // 3. Seeded momentum — older snapshot so chips render
  {
    const seedMomentum = {
      intake:             { pct: 0,  at: '2026-05-11T10:00:00.000Z' },
      lead_intelligence:  { pct: 18, at: '2026-05-11T10:00:00.000Z' },  // current is 0 -> down 18
      marketing:          { pct: 0,  at: '2026-05-11T10:00:00.000Z' },
      execution:          { pct: 0,  at: '2026-05-11T10:00:00.000Z' },
      reporting:          { pct: 60, at: '2026-05-11T10:00:00.000Z' },  // current is 0 -> regressed
      other:              { pct: 80, at: '2026-05-11T10:00:00.000Z' },  // current is 0 -> regressed
    };
    const ctx = await ctxFactory(seedMomentum);
    const page = await ctx.newPage();
    console.log('[bp-v2] 03-with-momentum-chips');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: path.join(OUT_DIR, '03-with-momentum-chips.png'), fullPage: false });
    await ctx.close();
  }

  // 4. Flow-strip detail — capture just the top region
  {
    const ctx = await ctxFactory(null);
    const page = await ctx.newPage();
    console.log('[bp-v2] 04-flow-strip-detail');
    await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    // Capture the first ~480px so the flow strip + first domain row are visible large
    await page.screenshot({
      path: path.join(OUT_DIR, '04-flow-strip-detail.png'),
      clip: { x: 0, y: 60, width: 1440, height: 520 },
    });
    await ctx.close();
  }

  await browser.close();
  console.log(`[bp-v2] Done. 4 variants saved to ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
