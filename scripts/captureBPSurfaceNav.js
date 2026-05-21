/**
 * captureBPSurfaceNav — 2026-05-21.
 *
 * Verifies the three BP-surface navigation fixes on the live Colaberry
 * project (signed in as Ali, not the demo account):
 *   1. NEXT chip + accent on the current-priority row
 *   2. Priority-sorted order within each expanded domain
 *   3. Critique handoff: clicking "Critique this page" lands on
 *      /portal/visual-workspace?bp=...&route=... pre-filled
 *
 * Output:
 *   docs/screenshots/<YYYY-MM-DD>-bps-surface-nav/*.png + REPORT.html
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot } = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join(REPO_ROOT, 'docs', 'screenshots', `${DATE}-bps-surface-nav`);

// The cap to drive the Critique-handoff stop. Lead Management has a
// known /admin/leads route and is reliably present on Colaberry.
const CRITIQUE_CAP_NAME = 'Lead Management';

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[bps-nav] out=${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await createSafeContext(browser, { label: 'safe' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const stops = [];

  // Stop 1: BPs surface landing — capture the full domain list
  console.log('[bps-nav] → 1/4: BPs surface landing');
  await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2500);
  await safeScreenshot(page, path.join(OUT_DIR, '01-bps-landing.png'), { fullPage: true });
  stops.push({
    id: '01-bps-landing',
    title: 'BPs surface — domain list',
    url: `${BASE}/portal/project/system?tab=bps`,
    expected: 'Domain stack with CURRENT PRIORITY badge on AI & Intelligence.',
  });

  // Stop 2: Expand AI & Intelligence + capture priority-sorted rows
  console.log('[bps-nav] → 2/4: expand AI & Intelligence domain');
  try {
    await page.getByText('AI & Intelligence', { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (err) {
    console.warn('[bps-nav]   could not click AI & Intelligence header:', err.message);
  }
  await safeScreenshot(page, path.join(OUT_DIR, '02-ai-intel-expanded.png'), { fullPage: true });
  stops.push({
    id: '02-ai-intel-expanded',
    title: 'AI & Intelligence expanded — NEXT chip + priority sort',
    url: 'click on AI & Intelligence',
    expected: 'Validation Parser at top with NEXT chip + 4px primary-blue left border + blue tint. "Sorted by priority" italic hint above rows.',
  });

  // Stop 3: Open Lead Management cap detail
  console.log('[bps-nav] → 3/4: open Lead Management cap detail');
  await page.goto(`${BASE}/portal/project/system?tab=bps`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(2000);
  // Lead Management lives in the Lead Intelligence domain; expand it then click.
  try {
    await page.getByText('Lead Intelligence', { exact: false }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.getByText(CRITIQUE_CAP_NAME, { exact: true }).first().click({ timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (err) {
    console.warn(`[bps-nav]   could not open ${CRITIQUE_CAP_NAME} detail:`, err.message);
  }
  await safeScreenshot(page, path.join(OUT_DIR, '03-cap-detail-with-critique-button.png'), { fullPage: false });
  stops.push({
    id: '03-cap-detail-with-critique-button',
    title: 'Lead Management cap detail — Critique button visible',
    url: 'click Lead Management',
    expected: '"Critique this page" button next to live preview at /admin/leads.',
  });

  // Stop 4: Click "Critique this page" + verify URL has ?bp=...&route=/admin/leads
  console.log('[bps-nav] → 4/4: click Critique this page');
  let critiqueUrl = '';
  try {
    await page.getByRole('button', { name: /Critique this page/i }).click({ timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 25000 });
    await page.waitForTimeout(2000);
    critiqueUrl = page.url();
  } catch (err) {
    console.warn('[bps-nav]   could not click Critique button:', err.message);
    critiqueUrl = page.url();
  }
  await safeScreenshot(page, path.join(OUT_DIR, '04-after-critique-click.png'), { fullPage: true });
  const hasCorrectParams = critiqueUrl.includes('bp=') && critiqueUrl.includes('route=');
  stops.push({
    id: '04-after-critique-click',
    title: 'After clicking Critique this page',
    url: critiqueUrl,
    expected: 'URL contains ?bp=<id>&route=/admin/leads — visual workspace pre-fills picker.',
    landedCorrectly: hasCorrectParams,
  });

  await browser.close();

  // Write the report
  const reportRows = stops.map(s => `
    <section class="stop">
      <h2>${esc(s.title)}</h2>
      <div class="meta"><b>URL:</b> <code>${esc(s.url)}</code></div>
      <p class="exp"><b>Expected:</b> ${esc(s.expected)}</p>
      ${s.landedCorrectly !== undefined ? `<p class="${s.landedCorrectly ? 'ok' : 'err'}"><b>${s.landedCorrectly ? '✓' : '✗'} Critique handoff:</b> ${s.landedCorrectly ? 'URL contains bp + route params' : 'URL missing bp/route — handoff broken'}</p>` : ''}
      <img src="${s.id}.png" alt="${esc(s.title)}" />
    </section>
  `).join('\n');

  const reportHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BPs Surface Nav — Verification ${DATE}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; color: #1f2937; background: #f8fafc; }
  h1 { font-size: 22px; color: #1a365d; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 1.5rem; }
  .stop { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.4rem; margin: 1rem 0; }
  .stop h2 { font-size: 16px; color: #1a365d; margin: 0 0 8px; }
  .meta { font-size: 12.5px; color: #6b7280; margin-bottom: 6px; }
  .exp { font-size: 13px; color: #4b5563; padding: 6px 10px; background: #f1f5f9; border-left: 3px solid #3b82f6; border-radius: 4px; }
  .ok { color: #15803d; font-weight: 600; padding: 6px 10px; background: #dcfce7; border-radius: 4px; }
  .err { color: #b91c1c; font-weight: 600; padding: 6px 10px; background: #fee2e2; border-radius: 4px; }
  img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; margin-top: 8px; }
  code { font-family: ui-monospace, Menlo, monospace; background: #f1f5f9; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
</style></head>
<body>
<h1>BPs Surface Nav — Verification</h1>
<div class="sub">${DATE} · base ${esc(BASE)} · ${consoleErrors.length} console error(s)</div>
${reportRows}
</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'REPORT.html'), reportHtml, 'utf8');
  console.log(`\n[bps-nav] report: ${path.join(OUT_DIR, 'REPORT.html')}`);
  console.log(`[bps-nav] ${stops.length} stops, ${consoleErrors.length} console errors.`);
  for (const s of stops) {
    if (s.landedCorrectly !== undefined) {
      console.log(`[bps-nav]   ${s.landedCorrectly ? '✓' : '✗'} ${s.id}: ${s.url}`);
    }
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main().catch(err => { console.error(err); process.exit(1); });
