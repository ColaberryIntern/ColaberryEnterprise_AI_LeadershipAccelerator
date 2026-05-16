/**
 * captureTopologyRecovery.js
 *
 * Operational Priority Topology Recovery + Verification Hardening Sprint,
 * 2026-05-16.
 *
 * Captures bounded production screenshots that prove the already-shipped
 * topology UX is live: priority badge, accent borders, "Why this matters"
 * sentence in the leverage block, bpSignals on capability cards, and the
 * build-composition summary replacing the misleading 0%.
 *
 * All captures routed through scripts/captureHelpers.js — every PNG is
 * ≤1800px wide, and _summary.json carries the per-file width ledger.
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
const PROJECT_SLUG = process.env.CAPTURE_PROJECT || 'colaberry-enterprise-ai-accelerator';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-priority-topology-recovery`,
);
const TOKEN = readDefaultToken();

const BPS_URL = `${BASE}/portal/project/${PROJECT_SLUG}/system?tab=bps`;
const COMPONENTS_URL = `${BASE}/portal/project/${PROJECT_SLUG}/system?tab=components`;

// Find a DOM element by walking sections and matching text content.
// Returns { x, y, width, height } clip rect (clamped to MAX_SAFE_WIDTH) or null.
async function rectForSection(page, predicateBody) {
  return page.evaluate(({ predBody, max }) => {
    // eslint-disable-next-line no-new-func
    const pred = new Function('section', predBody);
    const sections = Array.from(document.querySelectorAll('section'));
    const match = sections.find(s => pred(s));
    if (!match) return null;
    const r = match.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 8)),
      y: Math.max(0, Math.floor(r.top - 8)),
      width: Math.min(max, Math.ceil(r.width + 16)),
      height: Math.ceil(r.height + 16),
    };
  }, { predBody: predicateBody, max: MAX_SAFE_WIDTH });
}

// Span-rect across two adjacent sections.
async function rectAcrossTwoSections(page, firstPredicateBody) {
  return page.evaluate(({ predBody, max }) => {
    // eslint-disable-next-line no-new-func
    const pred = new Function('section', predBody);
    const sections = Array.from(document.querySelectorAll('section'));
    const idx = sections.findIndex(s => pred(s));
    if (idx === -1) return null;
    const first = sections[idx];
    const next = sections[idx + 1] || first;
    const r1 = first.getBoundingClientRect();
    const r2 = next.getBoundingClientRect();
    const left = Math.min(r1.left, r2.left);
    const top = Math.min(r1.top, r2.top);
    const right = Math.max(r1.right, r2.right);
    const bottom = Math.max(r1.bottom, r2.bottom);
    return {
      x: Math.max(0, Math.floor(left - 8)),
      y: Math.max(0, Math.floor(top - 8)),
      width: Math.min(max, Math.ceil(right - left + 16)),
      height: Math.ceil(bottom - top + 16),
    };
  }, { predBody: firstPredicateBody, max: MAX_SAFE_WIDTH });
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[recovery] Out: ${OUT_DIR}`);
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

  // Use a taller viewport for the full-page capture so the BPs surface
  // renders enough content to be visually informative without scrolling
  // the screenshot off-page.
  const ctx = await createSafeContext(browser, {
    token: TOKEN,
    label: 'safe',
    viewport: { height: 1800 },
  });
  const page = await ctx.newPage();

  // ── 1. Full System BPs surface ────────────────────────────────────────
  console.log('[recovery] 1 — full System BPs surface');
  await page.goto(BPS_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500); // SPA hydration + Cory priority resolution
  const out1 = path.join(OUT_DIR, '01-system-bps-full.png');
  const info1 = await boundedFullPage(page, out1, { label: 'safe' });
  push('01-system-bps-full', 'Full System BPs surface — priority-first ordering', info1, out1);

  // ── 2. Priority + adjacent downstream rows ────────────────────────────
  console.log('[recovery] 2 — priority + downstream row span');
  // Scroll the priority section into view so the clip rect captures it cleanly.
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('section'));
    const priority = all.find(s => s.textContent && s.textContent.includes('Current priority'));
    if (priority) priority.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  const clip2 = await rectAcrossTwoSections(
    page,
    'return section.textContent && section.textContent.includes("Current priority");'
  );
  if (clip2) {
    const out2 = path.join(OUT_DIR, '02-priority-and-downstream-rows.png');
    const info2 = await safeScreenshot(page, out2, { clip: clip2, label: 'safe' });
    push('02-priority-and-downstream-rows', 'Priority row + adjacent downstream row', info2, out2);
  } else {
    console.warn('  [warn] Priority section not found — Cory may not have mapped to a known domain.');
  }

  // ── 3. Expanded domain showing "Why this matters" in leverage block ───
  console.log('[recovery] 3 — leverage block with "Why this matters"');
  // Expand the priority section if collapsed; the leverage block ([aria-label="Operational leverage"])
  // is part of BPDomainSurface and is visible on the surface itself, not inside a row.
  // Scroll the leverage block into view.
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
    const out3 = path.join(OUT_DIR, '03-leverage-with-why-this-matters.png');
    const info3 = await safeScreenshot(page, out3, { clip: clip3, label: 'safe' });
    push('03-leverage-with-why-this-matters', 'Leverage block — "Why this matters" sentence', info3, out3);
  } else {
    console.warn('  [warn] Operational leverage block not present on this surface.');
  }

  // ── 4. Three capability cards on Components tab ───────────────────────
  console.log('[recovery] 4 — three capability cards (Components tab)');
  await page.goto(COMPONENTS_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const cards = document.querySelectorAll('.row.g-3 > .col-md-6, .row.g-3 > .col-lg-4');
    if (cards.length > 0) cards[0].scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  const clip4 = await page.evaluate(({ max }) => {
    const row = document.querySelector('.row.g-3');
    if (!row) return null;
    const cards = row.querySelectorAll(':scope > div');
    if (cards.length === 0) return null;
    const first = cards[0].getBoundingClientRect();
    const lastIdx = Math.min(2, cards.length - 1); // first 3 cards
    const last = cards[lastIdx].getBoundingClientRect();
    const left = Math.min(first.left, last.left);
    const top = Math.min(first.top, last.top);
    const right = Math.max(first.right, last.right);
    const bottom = Math.max(first.bottom, last.bottom);
    return {
      x: Math.max(0, Math.floor(left - 8)),
      y: Math.max(0, Math.floor(top - 8)),
      width: Math.min(max, Math.ceil(right - left + 16)),
      height: Math.ceil(bottom - top + 16),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip4) {
    const out4 = path.join(OUT_DIR, '04-capability-cards-with-bp-signals.png');
    const info4 = await safeScreenshot(page, out4, { clip: clip4, label: 'safe' });
    push('04-capability-cards-with-bp-signals', 'Capability cards with bpSignals pillars + kind + builtness', info4, out4);
  } else {
    console.warn('  [warn] Capability cards not found.');
  }

  // ── 5. Build-composition summary header ───────────────────────────────
  console.log('[recovery] 5 — build-composition summary header');
  await page.evaluate(() => {
    // The header is the first card on the components tab — scroll back to top.
    window.scrollTo({ top: 0 });
  });
  await page.waitForTimeout(400);
  const clip5 = await page.evaluate(({ max }) => {
    // The composition card contains an h6 with the speedometer icon.
    const ico = document.querySelector('.bi-speedometer2');
    if (!ico) return null;
    const card = ico.closest('.card');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - 8)),
      y: Math.max(0, Math.floor(r.top - 8)),
      width: Math.min(max, Math.ceil(r.width + 16)),
      height: Math.ceil(r.height + 16),
    };
  }, { max: MAX_SAFE_WIDTH });
  if (clip5) {
    const out5 = path.join(OUT_DIR, '05-build-composition-summary.png');
    const info5 = await safeScreenshot(page, out5, { clip: clip5, label: 'safe' });
    push('05-build-composition-summary', 'Build-composition summary replacing the misleading 0%', info5, out5);
  } else {
    console.warn('  [warn] Build-composition header not found.');
  }

  await ctx.close();
  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);

  const oversize = entries.filter(e => e.finalWidth && e.finalWidth > MAX_SAFE_WIDTH);
  if (oversize.length) {
    console.error(`[recovery] ✗ ${oversize.length} PNG(s) exceed MAX_SAFE_WIDTH after clamp:`, oversize);
    process.exit(2);
  }
  console.log(`[recovery] Done. ${entries.length} captures in ${OUT_DIR}, all ≤ ${MAX_SAFE_WIDTH}px.`);
})().catch(e => { console.error(e); process.exit(1); });
