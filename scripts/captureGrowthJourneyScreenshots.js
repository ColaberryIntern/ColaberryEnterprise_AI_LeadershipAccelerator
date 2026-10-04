/**
 * Capture the Growth Journey admin surface for review (Phase 6, T619).
 *
 * TWO KINDS OF IMAGE, AND THE DIFFERENCE IS THE POINT.
 *
 *  1. HARNESS captures. Real components, really rendered by
 *     `phase6Harness.dump.test.tsx`, dressed here in the app's own stylesheets.
 *     They prove layout and wording in states a dark system cannot reach: a null
 *     rate beside a real zero, a handoff blocked at capacity, an active pause.
 *     They prove NOTHING about production behaviour, and are labelled so.
 *
 *  2. PRODUCTION captures. The live app through a real admin session. These are the
 *     only images that evidence production, and they need an admin token.
 *
 * THE TOKEN IS NEVER MINTED HERE and never written to a committed file. It comes from
 * `CAPTURE_ADMIN_TOKEN`, or from `scripts/.ali_jwt.txt` (gitignored) via
 * `captureHelpers.readDefaultToken()`. With no usable token the production captures
 * are SKIPPED AND REPORTED as skipped - never replaced with a login page shot, and
 * never quietly omitted, because a review doc missing a stop is worse than one that
 * says the stop is missing.
 *
 * Usage:
 *   HARNESS_DIR=<dir with the dump html>  node scripts/captureGrowthJourneyScreenshots.js
 *   CAPTURE_HOST=https://www.refactored.ai CAPTURE_ADMIN_TOKEN=<jwt> node scripts/...
 *
 * The host is never a literal in this file.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
  createSafeContext, safeScreenshot, maxWidthGuard, writeCaptureSummary, readDefaultToken,
} = require('./captureHelpers');

const HOST = process.env.CAPTURE_HOST || '';
const HARNESS_DIR = process.env.HARNESS_DIR || '';
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.CAPTURE_OUT
  || path.join('docs', 'screenshots', `${DATE}-growth-journey-phase6-deploy`);

/** The stylesheets the app really serves, so a harness shot is not a naked DOM. */
const STYLES = [
  'frontend/src/styles/tokens.css',
  'frontend/src/styles/global.css',
  'frontend/src/styles/responsive.css',
];

const BOOTSTRAP = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const REMIX = 'https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css';

const SURFACES = [
  ['switched-off', 'The dark state: the banner names the flag, not a symptom'],
  ['unseeded', 'The unseeded state: it names the seed script'],
  ['handoffs', 'The queue - a blocked assignment, a redacted reason, unstable paging stated'],
  ['performance', 'A null rate beside a REAL zero, each absence with its own reason'],
  ['controls', 'The only write surface, with an active pause listed'],
];

function harnessPage(bodyHtml) {
  const css = STYLES
    .filter((p) => fs.existsSync(p))
    .map((p) => `<style>${fs.readFileSync(p, 'utf8')}</style>`)
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="${BOOTSTRAP}">
<link rel="stylesheet" href="${REMIX}">
${css}
<style>body{background:#f7fafc;margin:0;padding:24px;font-family:'Segoe UI',system-ui,sans-serif}
.harness-note{max-width:1100px;margin:0 auto 16px;padding:8px 12px;border-left:4px solid #FB2832;
background:#FFF0F1;font-size:12px;color:#2d3748}
.harness-body{max-width:1100px;margin:0 auto;background:#fff;padding:20px;border-radius:6px;
border:1px solid #e2e8f0}</style></head><body>
<div class="harness-note"><strong>Component capture, not production.</strong>
Real components, fixture data, no admin session. Production is dark, so these states
cannot be photographed live.</div>
<div class="harness-body">${bodyHtml}</div></body></html>`;
}

async function captureHarness(browser, entries) {
  if (!HARNESS_DIR || !fs.existsSync(HARNESS_DIR)) {
    console.log(`[capture] no HARNESS_DIR (${HARNESS_DIR || 'unset'}) - skipping harness shots`);
    return;
  }
  const ctx = await createSafeContext(browser);
  const page = await ctx.newPage();
  for (const [name, what] of SURFACES) {
    const src = path.join(HARNESS_DIR, `${name}.html`);
    if (!fs.existsSync(src)) {
      console.log(`[capture] MISSING harness html: ${name} - run the dump test first`);
      entries.push({ name: `harness-${name}`, status: 'missing', what });
      continue;
    }
    const tmp = path.join(OUT_DIR, `_${name}.html`);
    fs.writeFileSync(tmp, harnessPage(fs.readFileSync(src, 'utf8')), 'utf8');
    await page.goto(`file://${path.resolve(tmp).replace(/\\/g, '/')}`);
    await page.waitForTimeout(350);
    const out = path.join(OUT_DIR, `harness-${name}.png`);
    await safeScreenshot(page, out, { fullPage: true });
    const guard = await maxWidthGuard(out);
    fs.unlinkSync(tmp);
    console.log(`[capture] harness-${name}.png  ${guard.finalWidth}px`
      + (guard.downscaled ? ` (downscaled from ${guard.originalWidth})` : ''));
    entries.push({
      name: `harness-${name}`, file: path.basename(out),
      width: guard.finalWidth, downscaled: guard.downscaled,
      kind: 'component capture (fixture data, no admin session)', what,
    });
  }
  await ctx.close();
}

async function captureProduction(browser, entries) {
  const token = process.env.CAPTURE_ADMIN_TOKEN || readDefaultToken();
  if (!HOST) {
    console.log('[capture] CAPTURE_HOST unset - production captures SKIPPED');
    entries.push({ name: 'production', status: 'skipped', why: 'CAPTURE_HOST unset' });
    return;
  }
  if (!token) {
    console.log('[capture] no admin token - production captures SKIPPED');
    entries.push({ name: 'production', status: 'skipped', why: 'no admin token available' });
    return;
  }
  // An expired token authenticates nothing and would photograph a login screen, which
  // is the one outcome worse than no image. Decode and refuse before opening a page.
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) {
      const hrs = Math.round((Date.now() - claims.exp * 1000) / 3600000);
      console.log(`[capture] token EXPIRED ${hrs}h ago - production captures SKIPPED`);
      entries.push({
        name: 'production', status: 'skipped',
        why: `admin token expired ${hrs}h ago; a fresh one is needed`,
      });
      return;
    }
  } catch (e) {
    console.log(`[capture] token unreadable (${e.message}) - production captures SKIPPED`);
    entries.push({ name: 'production', status: 'skipped', why: 'token unreadable' });
    return;
  }

  // `token: null` on purpose: the helper seeds `participant_token`, which is the
  // PORTAL's key. The admin app reads `admin_token` (`frontend/src/utils/api.ts:19`),
  // so that one is injected explicitly below and is the only token path here.
  // `baseURL` is not an option this helper takes, so every goto below is absolute.
  const ctx = await createSafeContext(browser, { token: null });
  await ctx.addInitScript((t) => {
    try { window.localStorage.setItem('admin_token', t); } catch (e) { /* private mode */ }
  }, token);
  const page = await ctx.newPage();
  const stops = [
    ['prod-workspace-off', '/admin/growth-journey', 'The live workspace in its dark state'],
    ['prod-handoff-404', '/admin/growth-journey/handoffs/00000000-0000-0000-0000-000000000000',
      'A handoff that does not exist: 404 as not-found, never as an error'],
  ];
  for (const [name, route, what] of stops) {
    await page.goto(`${HOST}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const out = path.join(OUT_DIR, `${name}.png`);
    await safeScreenshot(page, out, { fullPage: true });
    const guard = await maxWidthGuard(out);
    console.log(`[capture] ${name}.png  ${guard.finalWidth}px`);
    entries.push({
      name, file: path.basename(out),
      width: guard.finalWidth, downscaled: guard.downscaled,
      kind: 'production capture (live app, admin session)', what, route,
    });
  }
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const entries = [];
  try {
    await captureHarness(browser, entries);
    await captureProduction(browser, entries);
  } finally {
    await browser.close();
  }
  writeCaptureSummary(OUT_DIR, entries);
  const shot = entries.filter((e) => e.file).length;
  const skipped = entries.filter((e) => e.status).length;
  console.log(`[capture] ${shot} image(s) in ${OUT_DIR}; ${skipped} skipped/missing`);
  if (skipped) console.log('[capture] the skips are recorded in _summary.json and belong in the review doc');
})();
