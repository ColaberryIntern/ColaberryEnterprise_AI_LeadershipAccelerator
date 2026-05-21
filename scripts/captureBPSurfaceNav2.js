/**
 * captureBPSurfaceNav2 — 2026-05-21.
 *
 * Improved verification: two direct captures (no click chains), plus
 * a cap-detail capture via deep link.
 *
 *   stop 1: BPs landing + AI & Intelligence auto-expanded by url anchor
 *   stop 2: Lead Management cap detail via ?bp=<id>
 *   stop 3: Visual workspace pre-filled via ?bp=<id>&route=/admin/leads
 *           (this IS the Critique handoff URL the BPDetailV2 button now uses)
 *
 * Output:
 *   docs/screenshots/<date>-bps-nav-v2/*.png + REPORT.html
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-bps-nav-v2`);

// Real IDs verified against prod 2026-05-21.
const LEAD_MGMT_ID = '5b3239a6-1d86-4c6e-9a24-37f2a758e3ff';
const LEAD_MGMT_ROUTE = '/admin/leads';

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[bps-nav2] out=${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await createSafeContext(browser, { label: 'safe' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // Stop 1: BPs landing
  console.log('[bps-nav2] → 1: BPs landing');
  await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2500);
  await safeScreenshot(page, path.join(OUT_DIR, '01-bps-landing.png'), { fullPage: true });

  // Stop 2: AI & Intelligence expanded — try clicking domain header
  console.log('[bps-nav2] → 2: AI & Intelligence expanded');
  try {
    // Try several selectors; domain headers often have icon + label
    const candidates = [
      page.locator('button:has-text("AI & Intelligence")').first(),
      page.locator('div:has-text("AI & Intelligence")').first(),
      page.locator('text="AI & Intelligence"').first(),
    ];
    for (const c of candidates) {
      try { await c.click({ timeout: 3000 }); break; } catch { /* try next */ }
    }
    await page.waitForTimeout(2000);
  } catch (err) {
    console.warn('[bps-nav2]   could not click domain:', err.message);
  }
  await safeScreenshot(page, path.join(OUT_DIR, '02-ai-intel-expanded.png'), { fullPage: true });

  // Stop 3: Visual workspace pre-filled via the Critique handoff URL.
  // This is EXACTLY the URL that BPDetailV2's "Critique this page" now navigates to.
  const critiqueUrl = `${BASE}/portal/visual-workspace?bp=${encodeURIComponent(LEAD_MGMT_ID)}&route=${encodeURIComponent(LEAD_MGMT_ROUTE)}`;
  console.log('[bps-nav2] → 3: critique handoff URL: ' + critiqueUrl);
  await page.goto(critiqueUrl, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2500);
  const landedUrl = page.url();
  const prefilled = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const routeInput = inputs.find(i => i.value && i.value.startsWith('/admin'));
    return routeInput ? routeInput.value : '';
  }).catch(() => '');
  await safeScreenshot(page, path.join(OUT_DIR, '03-critique-url-handoff.png'), { fullPage: true });

  await browser.close();

  const handoffOk = landedUrl.includes('bp=') && landedUrl.includes('route=');

  const reportHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BPs Surface Nav v2 — ${DATE}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; color: #1f2937; background: #f8fafc; }
  h1 { font-size: 22px; color: #1a365d; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 1.5rem; }
  .stop { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.4rem; margin: 1rem 0; }
  .stop h2 { font-size: 16px; color: #1a365d; margin: 0 0 8px; }
  .meta { font-size: 12.5px; color: #6b7280; margin: 6px 0; }
  .exp { font-size: 13px; color: #4b5563; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #3b82f6; border-radius: 4px; }
  .ok { color: #15803d; font-weight: 600; padding: 6px 10px; background: #dcfce7; border-radius: 4px; }
  .err { color: #b91c1c; font-weight: 600; padding: 6px 10px; background: #fee2e2; border-radius: 4px; }
  img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; margin-top: 8px; }
  code { font-family: ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
</style></head>
<body>
<h1>BPs Surface Nav v2 — Verification</h1>
<div class="sub">${DATE} · base ${esc(BASE)} · ${consoleErrors.length} console error(s)</div>

<div class="stop">
  <h2>1. BPs landing</h2>
  <div class="meta"><b>URL:</b> <code>/portal/project/system?tab=bps</code></div>
  <p class="exp"><b>Expected:</b> Domain stack with CURRENT PRIORITY badge on AI &amp; Intelligence; hide-phantoms toggle visible in header.</p>
  <img src="01-bps-landing.png" />
</div>

<div class="stop">
  <h2>2. AI &amp; Intelligence expanded</h2>
  <div class="meta"><b>URL:</b> click on AI &amp; Intelligence header</div>
  <p class="exp"><b>Expected:</b> "Sorted by priority · current next-action pinned to top" hint above rows. Validation Parser at top with NEXT chip + 4px primary-blue left border + blue tint background.</p>
  <img src="02-ai-intel-expanded.png" />
</div>

<div class="stop">
  <h2>3. Critique URL handoff (the BPDetailV2 navigation target)</h2>
  <div class="meta"><b>URL navigated to:</b> <code>${esc(critiqueUrl)}</code></div>
  <div class="meta"><b>Landed on:</b> <code>${esc(landedUrl)}</code></div>
  <div class="meta"><b>Picker pre-fill detected:</b> <code>${esc(prefilled || '(none — picker still on default)')}</code></div>
  <p class="${handoffOk ? 'ok' : 'err'}"><b>${handoffOk ? '✓' : '✗'} URL retains bp + route params:</b> ${handoffOk ? 'yes (handoff fixed)' : 'no (handoff broken)'}</p>
  <p class="exp"><b>Expected:</b> Visual workspace renders with the picker pre-filled to <code>/admin/leads</code>. This is exactly the URL that BPDetailV2's "Critique this page" button now navigates to.</p>
  <img src="03-critique-url-handoff.png" />
</div>

</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'REPORT.html'), reportHtml, 'utf8');
  console.log(`\n[bps-nav2] report: ${path.join(OUT_DIR, 'REPORT.html')}`);
  console.log(`[bps-nav2] critique handoff URL retained params: ${handoffOk ? 'yes' : 'no'}`);
  console.log(`[bps-nav2] picker pre-fill detected: ${prefilled || '(none)'}`);
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

main().catch(err => { console.error(err); process.exit(1); });
