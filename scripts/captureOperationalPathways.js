/**
 * captureOperationalPathways.js
 *
 * Operational Pathways + Cory Priority Embedding Sprint, 2026-05-16.
 *
 * Captures bounded production screenshots that prove the two new
 * additions are live: the qualitative pathway-stage chip in each
 * domain row's title bar, and the priority/downstream dependency
 * accent now extending through BP rows.
 *
 * All captures routed through scripts/captureHelpers.js — every PNG
 * is ≤1800px wide, and _summary.json carries the per-file width
 * ledger.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  boundedFullPage,
  writeCaptureSummary,
  readDefaultToken,
  MAX_SAFE_WIDTH,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operational-pathways`,
);
const TOKEN = readDefaultToken();

const BPS_URL = `${BASE}/portal/project/system?tab=bps`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[pathways] Out: ${OUT_DIR}`);
  const browser = await chromium.launch({ headless: true });
  const entries = [];
  const push = (slug, label, info, outPath) => {
    entries.push({
      slug, label,
      file: path.basename(outPath),
      originalWidth: info.originalWidth,
      finalWidth: info.finalWidth,
      downscaled: info.downscaled,
    });
  };

  // Taller viewport so the full-page capture renders enough of the
  // stack to show pathway-stage chips across multiple domain rows.
  const ctx = await createSafeContext(browser, {
    token: TOKEN,
    label: 'safe',
    viewport: { height: 2200 },
  });
  const page = await ctx.newPage();

  // ── 1. Full System BPs surface — pathway-stage chips visible across all rows
  console.log('[pathways] 1 — full System BPs surface (stage chips across stack)');
  await page.goto(BPS_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  const out1 = path.join(OUT_DIR, '01-system-bps-with-stage-chips.png');
  const info1 = await boundedFullPage(page, out1, { label: 'safe' });
  push('01-system-bps-with-stage-chips', 'Full BPs surface — stage chips visible across all domain rows', info1, out1);

  // ── 2. Title-row crop of the priority domain — shows chip + badge together
  console.log('[pathways] 2 — priority domain title row (stage chip + Current priority badge)');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('section'));
    const priority = all.find(s => s.textContent && s.textContent.includes('Current priority'));
    if (priority) priority.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  const clip2 = await page.evaluate(({ max }) => {
    const all = Array.from(document.querySelectorAll('section'));
    const priority = all.find(s => s.textContent && s.textContent.includes('Current priority'));
    if (!priority) return null;
    // Capture just the header (button) of the priority section — the
    // title row sits in the first ~80px of the section.
    const r = priority.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 8)),
      y: Math.max(0, Math.floor(r.top - 8)),
      width: Math.min(max, Math.ceil(r.width + 16)),
      height: Math.min(110, Math.ceil(r.height)),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip2) {
    const out2 = path.join(OUT_DIR, '02-priority-title-row-with-stage-chip.png');
    const info2 = await safeScreenshot(page, out2, { clip: clip2, label: 'safe' });
    push('02-priority-title-row-with-stage-chip', 'Priority domain title row — stage chip alongside Current priority', info2, out2);
  } else {
    console.warn('  [warn] priority section not found');
  }

  // ── 3. Expand the priority domain so we can capture BP rows beneath it
  console.log('[pathways] 3 — expand priority section + capture BP rows with inherited accent');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('section'));
    const priority = all.find(s => s.textContent && s.textContent.includes('Current priority'));
    if (!priority) return;
    const headerBtn = priority.querySelector('button[aria-expanded]');
    if (headerBtn && headerBtn.getAttribute('aria-expanded') === 'false') {
      headerBtn.click();
    }
    priority.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(600);
  // Capture the priority section (now expanded) showing the BP rows below
  // the header. Each BP row should carry a primary left-border.
  const clip3 = await page.evaluate(({ max }) => {
    const all = Array.from(document.querySelectorAll('section'));
    const priority = all.find(s => s.textContent && s.textContent.includes('Current priority'));
    if (!priority) return null;
    const r = priority.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 8)),
      y: Math.max(0, Math.floor(r.top - 8)),
      width: Math.min(max, Math.ceil(r.width + 16)),
      height: Math.min(900, Math.ceil(r.height + 16)),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip3) {
    const out3 = path.join(OUT_DIR, '03-priority-expanded-bps-with-accent.png');
    const info3 = await safeScreenshot(page, out3, { clip: clip3, label: 'safe' });
    push('03-priority-expanded-bps-with-accent', 'Priority domain expanded — primary left-border accent on each BP row', info3, out3);
  } else {
    console.warn('  [warn] priority section not found post-expand');
  }

  // ── 4. Zero-horizontal-scroll proof — capture the viewport's body width
  console.log('[pathways] 4 — zero horizontal scroll proof');
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(400);
  const scrollInfo = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log('  scroll info:', scrollInfo);
  // Persist the scroll diagnostic into the summary as a small text file
  // so the review HTML can reference it.
  fs.writeFileSync(path.join(OUT_DIR, '_scroll-diagnostic.json'), JSON.stringify(scrollInfo, null, 2));

  // Also capture the top of the surface at viewport-only (not full-page)
  // so we have a visible artifact of the viewport boundary.
  const out4 = path.join(OUT_DIR, '04-viewport-top-no-horizontal-scroll.png');
  const info4 = await safeScreenshot(page, out4, { fullPage: false, label: 'safe' });
  push('04-viewport-top-no-horizontal-scroll', 'Viewport-only capture (top of BPs surface) — confirms zero horizontal scroll', info4, out4);

  await ctx.close();
  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);

  const oversize = entries.filter(e => e.finalWidth && e.finalWidth > MAX_SAFE_WIDTH);
  if (oversize.length) {
    console.error(`[pathways] ✗ ${oversize.length} PNG(s) exceed MAX_SAFE_WIDTH after clamp:`, oversize);
    process.exit(2);
  }
  console.log(`[pathways] Done. ${entries.length} captures in ${OUT_DIR}, all ≤ ${MAX_SAFE_WIDTH}px.`);
  if (scrollInfo.hasHorizontalScroll) {
    console.warn(`[pathways] ⚠ horizontal scroll detected (${scrollInfo.documentScrollWidth} > ${scrollInfo.documentClientWidth}px)`);
  }
})().catch(e => { console.error(e); process.exit(1); });
