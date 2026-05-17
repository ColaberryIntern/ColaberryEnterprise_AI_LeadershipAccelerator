/**
 * captureOperationalTrust.js
 *
 * Operational Trust + Decision Confidence Sprint, 2026-05-17.
 *
 * Audit-only sprint — NO code changes shipped. The captures here prove
 * the platform's operational-trust groundwork is already laid by prior
 * sprints' calm-vocabulary work. Each capture targets a specific
 * trust-building surface the review HTML cites as evidence.
 *
 * Captures (all routed through captureHelpers.js, ≤1800 px wide):
 *   01 — NextActionCard with inline operational `reason` field
 *   02 — Leverage block with "Why this matters" + structural resilience
 *   03 — Expanded priority domain — full trust vocabulary stack
 *   04 — CoryDrawer with humility disclosure (boundary-of-authority)
 *   05 — OperationalHistoryStrip with no-signal fallbacks ("— not opened yet")
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  writeCaptureSummary,
  readDefaultToken,
  MAX_SAFE_WIDTH,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(
  REPO_ROOT, 'docs', 'screenshots',
  `${new Date().toISOString().slice(0, 10)}-operational-trust`,
);
const TOKEN = readDefaultToken();

const HOME_URL = `${BASE}/portal/home`;
const BPS_URL = `${BASE}/portal/project/system?tab=bps`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[trust] Out: ${OUT_DIR}`);
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

  // ── 1. NextActionCard with inline reason ──────────────────────────────
  console.log('[trust] 1 — NextActionCard with inline operational reason');
  {
    // Seed seenIntros.home so the first-visit framing card is dismissed —
    // we want to capture the OPERATIONAL trust surface, not the onboarding.
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1400 },
      seededMemory: JSON.stringify({ seenIntros: { home: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const clip = await page.evaluate(({ max }) => {
      // The priority card is the first card after the page header. Find
      // by the "TODAY'S ONE PRIORITY" label string.
      const labels = Array.from(document.querySelectorAll('div, span'));
      const label = labels.find(el => el.textContent && el.textContent.trim().toUpperCase().startsWith("TODAY'S ONE PRIORITY"));
      if (!label) return null;
      const card = label.closest('div[style*="background"]') || label.parentElement;
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left - 8)),
        y: Math.max(0, Math.floor(r.top - 8)),
        width: Math.min(max, Math.ceil(r.width + 16)),
        height: Math.ceil(r.height + 16),
      };
    }, { max: MAX_SAFE_WIDTH });
    if (clip) {
      const out = path.join(OUT_DIR, '01-priority-card-with-inline-reason.png');
      const info = await safeScreenshot(page, out, { clip, label: 'safe' });
      push('01-priority-card-with-inline-reason', 'NextActionCard — operational reason visible inline (no drawer click required)', info, out);
    } else {
      console.warn('  [warn] priority card not found, falling back to viewport capture');
      const out = path.join(OUT_DIR, '01-priority-card-with-inline-reason.png');
      const info = await safeScreenshot(page, out, { fullPage: false, label: 'safe' });
      push('01-priority-card-with-inline-reason', 'Cory Home viewport (priority card visible)', info, out);
    }
    await ctx.close();
  }

  // ── 2. Leverage block ─────────────────────────────────────────────────
  console.log('[trust] 2 — leverage block with "Why this matters" + resilience');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1800 },
      seededMemory: JSON.stringify({ seenIntros: { systemBps: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(BPS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const lev = document.querySelector('[aria-label="Operational leverage"]');
      if (lev) lev.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    const clip = await page.evaluate(({ max }) => {
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
    if (clip) {
      const out = path.join(OUT_DIR, '02-leverage-with-why-and-resilience.png');
      const info = await safeScreenshot(page, out, { clip, label: 'safe' });
      push('02-leverage-with-why-and-resilience', 'Leverage block — operational consequence sentences, conditional + observational', info, out);
    }
    await ctx.close();
  }

  // ── 3. Expanded priority domain ───────────────────────────────────────
  console.log('[trust] 3 — expanded priority domain (full trust vocabulary)');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 2200 },
      seededMemory: JSON.stringify({ seenIntros: { systemBps: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(BPS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
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
    const clip = await page.evaluate(({ max }) => {
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
    if (clip) {
      const out = path.join(OUT_DIR, '03-priority-domain-full-trust-stack.png');
      const info = await safeScreenshot(page, out, { clip, label: 'safe' });
      push('03-priority-domain-full-trust-stack', 'Priority domain expanded — trust label + pathway stage + Current priority + accent + inherited context (all calm)', info, out);
    }
    await ctx.close();
  }

  // ── 4. CoryDrawer with humility disclosure ────────────────────────────
  console.log('[trust] 4 — CoryDrawer humility disclosure');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1600 },
      seededMemory: JSON.stringify({ seenIntros: { home: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    // Open the Cory drawer by clicking the whisper in the context bar.
    const clicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button'));
      const target = candidates.find(b => {
        const t = (b.getAttribute('title') || '').toLowerCase();
        return t.includes('full context') || t.includes('cory');
      }) || candidates.find(b => {
        return b.querySelector && b.querySelector('.bi-stars');
      });
      if (!target) return false;
      target.click();
      return true;
    });
    console.log('  cory whisper clicked:', clicked);
    await page.waitForTimeout(900);
    const out = path.join(OUT_DIR, '04-cory-drawer-humility-disclosure.png');
    const info = await safeScreenshot(page, out, { fullPage: false, label: 'safe' });
    push('04-cory-drawer-humility-disclosure', 'CoryDrawer — explicit humility disclosure: "I just summarize and suggest. Nothing here is autonomous."', info, out);
    await ctx.close();
  }

  // ── 5. OperationalHistoryStrip ────────────────────────────────────────
  console.log('[trust] 5 — OperationalHistoryStrip');
  {
    const ctx = await createSafeContext(browser, {
      token: TOKEN,
      label: 'safe',
      viewport: { height: 1500 },
      seededMemory: JSON.stringify({ seenIntros: { home: true } }),
    });
    const page = await ctx.newPage();
    await page.goto(HOME_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Operational history"]');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    const clip = await page.evaluate(({ max }) => {
      const el = document.querySelector('[aria-label="Operational history"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.max(0, Math.floor(r.left - 16)),
        y: Math.max(0, Math.floor(r.top - 8)),
        width: Math.min(max, Math.ceil(r.width + 32)),
        height: Math.ceil(r.height + 16),
      };
    }, { max: MAX_SAFE_WIDTH });
    if (clip) {
      const out = path.join(OUT_DIR, '05-history-strip-with-no-signal-fallbacks.png');
      const info = await safeScreenshot(page, out, { clip, label: 'safe' });
      push('05-history-strip-with-no-signal-fallbacks', 'OperationalHistoryStrip — calm no-signal fallbacks ("— not opened yet", "— none yet")', info, out);
    }
    await ctx.close();
  }

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);

  const oversize = entries.filter(e => e.finalWidth && e.finalWidth > MAX_SAFE_WIDTH);
  if (oversize.length) {
    console.error(`[trust] ✗ ${oversize.length} PNG(s) exceed MAX_SAFE_WIDTH:`, oversize);
    process.exit(2);
  }
  console.log(`[trust] Done. ${entries.length} captures in ${OUT_DIR}, all ≤ ${MAX_SAFE_WIDTH}px.`);
})().catch(e => { console.error(e); process.exit(1); });
