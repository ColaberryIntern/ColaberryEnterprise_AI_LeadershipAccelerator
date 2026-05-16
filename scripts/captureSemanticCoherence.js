/**
 * captureSemanticCoherence.js
 *
 * Semantic Coherence + Operational Wayfinding Sprint, 2026-05-16.
 *
 * Captures bounded production screenshots that prove the four shipped
 * additions are live: the refined text-only pathway-stage chip, the
 * enriched "Why this matters" sentence with pathway-stage parentheticals,
 * and the single section-header inherited context (no more 14x
 * repetition) inside an expanded priority section.
 *
 * All captures routed through scripts/captureHelpers.js — every PNG
 * is ≤1800px wide, and _summary.json carries the per-file width ledger.
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
  `${new Date().toISOString().slice(0, 10)}-semantic-coherence`,
);
const TOKEN = readDefaultToken();

const BPS_URL = `${BASE}/portal/project/system?tab=bps`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[coherence] Out: ${OUT_DIR}`);
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

  const ctx = await createSafeContext(browser, {
    token: TOKEN,
    label: 'safe',
    viewport: { height: 2200 },
  });
  const page = await ctx.newPage();

  await page.goto(BPS_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  // ── 1. Full BPs surface — for overall integrity check
  console.log('[coherence] 1 — full BPs surface');
  const out1 = path.join(OUT_DIR, '01-system-bps-full.png');
  const info1 = await boundedFullPage(page, out1, { label: 'safe' });
  push('01-system-bps-full', 'Full BPs surface — overall composition post-refinements', info1, out1);

  // ── 2. Refined chip in priority title row
  console.log('[coherence] 2 — refined chip in priority title row');
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
    const r = priority.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 8)),
      y: Math.max(0, Math.floor(r.top - 8)),
      width: Math.min(max, Math.ceil(r.width + 16)),
      height: Math.min(80, Math.ceil(r.height)),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip2) {
    const out2 = path.join(OUT_DIR, '02-refined-chip-title-row.png');
    const info2 = await safeScreenshot(page, out2, { clip: clip2, label: 'safe' });
    push('02-refined-chip-title-row', 'Refined pathway-stage chip — text-only with leading dot', info2, out2);
  } else {
    console.warn('  [warn] priority section not found');
  }

  // ── 3. Enriched "Why this matters" — leverage block crop
  console.log('[coherence] 3 — leverage block with pathway-stage parentheticals');
  await page.evaluate(() => {
    const lev = document.querySelector('[aria-label="Operational leverage"]');
    if (lev) lev.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  const clip3 = await page.evaluate(({ max }) => {
    const el = document.querySelector('[aria-label="Operational leverage"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 12)),
      y: Math.max(0, Math.floor(r.top - 12)),
      width: Math.min(max, Math.ceil(r.width + 24)),
      height: Math.ceil(r.height + 24),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip3) {
    const out3 = path.join(OUT_DIR, '03-why-this-matters-with-stages.png');
    const info3 = await safeScreenshot(page, out3, { clip: clip3, label: 'safe' });
    push('03-why-this-matters-with-stages', 'Leverage block — "Why this matters" now composes pathway-stage parentheticals', info3, out3);
  } else {
    console.warn('  [warn] leverage block not found');
  }

  // ── 4. Expanded priority section — single section header, no 14× repetition
  console.log('[coherence] 4 — expanded priority section with single section header');
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
  const clip4 = await page.evaluate(({ max }) => {
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
  if (clip4) {
    const out4 = path.join(OUT_DIR, '04-expanded-priority-single-section-header.png');
    const info4 = await safeScreenshot(page, out4, { clip: clip4, label: 'safe' });
    push('04-expanded-priority-single-section-header', 'Expanded priority section — inherited context as ONE section header, BP rows no longer repeat it', info4, out4);
  } else {
    console.warn('  [warn] expanded priority section not found');
  }

  await ctx.close();
  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);

  const oversize = entries.filter(e => e.finalWidth && e.finalWidth > MAX_SAFE_WIDTH);
  if (oversize.length) {
    console.error(`[coherence] ✗ ${oversize.length} PNG(s) exceed MAX_SAFE_WIDTH after clamp:`, oversize);
    process.exit(2);
  }
  console.log(`[coherence] Done. ${entries.length} captures in ${OUT_DIR}, all ≤ ${MAX_SAFE_WIDTH}px.`);
})().catch(e => { console.error(e); process.exit(1); });
