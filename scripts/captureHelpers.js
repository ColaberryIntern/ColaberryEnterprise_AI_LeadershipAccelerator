/**
 * captureHelpers.js
 *
 * Shared Playwright capture utilities for the Required Review Screenshot
 * Protocol. Centralizes the auth-injection + viewport + width-clamp pattern
 * that previously lived inline in four capture scripts.
 *
 * Why this exists: a prior session died because tmp/build-composition-card.png
 * was captured at 2128px wide at deviceScaleFactor=2 and the cumulative
 * many-image context exceeded Claude Code's 2000px ceiling. Every capture
 * pathway must now route through this module so that no PNG Claude is asked
 * to Read can ever exceed MAX_SAFE_WIDTH.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_SAFE_WIDTH = 1800;

const SAFE_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
});

const RETINA_REVIEW_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
});

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_TOKEN_FILE = path.join(REPO_ROOT, 'scripts', '.ali_jwt.txt');

function readDefaultToken() {
  if (process.env.CAPTURE_TOKEN) return process.env.CAPTURE_TOKEN;
  if (fs.existsSync(DEFAULT_TOKEN_FILE)) {
    return fs.readFileSync(DEFAULT_TOKEN_FILE, 'utf8').trim();
  }
  return null;
}

/**
 * Create a Playwright context with the auth token injected via
 * addInitScript (fires on every navigation in the context) and a
 * sanctioned viewport.
 *
 * Use `label: 'retina-review'` only when the captured PNG is for a
 * human-reviewed review-doc embed (NOT something Claude will Read back).
 * Any other label snaps the viewport to SAFE_VIEWPORT to keep the file
 * width under MAX_SAFE_WIDTH.
 */
async function createSafeContext(browser, opts = {}) {
  const {
    token = readDefaultToken(),
    seededMemory = null,
    viewport: viewportOverride = null,
    label = 'safe',
  } = opts;

  const baseViewport = label === 'retina-review' ? RETINA_REVIEW_VIEWPORT : SAFE_VIEWPORT;
  const viewport = viewportOverride
    ? { ...baseViewport, ...viewportOverride }
    : baseViewport;

  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
  });

  if (token) {
    await ctx.addInitScript(({ t, seeded }) => {
      try {
        window.localStorage.setItem('participant_token', t);
        if (seeded) window.localStorage.setItem('workspaceMemory:v1', seeded);
      } catch (_e) { /* localStorage unavailable in some contexts */ }
    }, { t: token, seeded: seededMemory });
  }

  return ctx;
}

/**
 * Read a PNG, downscale to MAX_SAFE_WIDTH if wider, write in place.
 * Returns { originalWidth, finalWidth, downscaled }.
 *
 * `label: 'retina-review'` skips the clamp — caller takes responsibility
 * that the file will not be read by Claude.
 */
async function maxWidthGuard(pngPath, opts = {}) {
  const { label = 'safe' } = opts;
  const meta = await sharp(pngPath).metadata();
  const originalWidth = meta.width || 0;

  if (label === 'retina-review' || originalWidth <= MAX_SAFE_WIDTH) {
    return { originalWidth, finalWidth: originalWidth, downscaled: false };
  }

  // sharp can't write to the same file it's reading; round-trip via buffer.
  const buf = await sharp(pngPath)
    .resize({ width: MAX_SAFE_WIDTH, withoutEnlargement: true })
    .png()
    .toBuffer();
  fs.writeFileSync(pngPath, buf);

  const after = await sharp(pngPath).metadata();
  return { originalWidth, finalWidth: after.width || MAX_SAFE_WIDTH, downscaled: true };
}

/**
 * Wraps page.screenshot with width-clamp + viewport-DSF assertion.
 *
 * Always logs the final width. Never throws on oversize — degrades safely
 * by downscaling in place so the rest of the capture batch can complete.
 */
async function safeScreenshot(page, outPath, opts = {}) {
  const {
    fullPage = false,
    clip = undefined,
    label = 'safe',
    omitBackground = false,
  } = opts;

  // Sanity check: catch a caller that built a non-retina context but
  // forgot to pass label: 'retina-review' when they wanted retina output.
  const viewport = page.viewportSize();
  if (label !== 'retina-review' && viewport && viewport.width > MAX_SAFE_WIDTH) {
    console.warn(`[captureHelpers] viewport ${viewport.width}px > MAX_SAFE_WIDTH (${MAX_SAFE_WIDTH}). Downscale will run post-capture.`);
  }

  await page.screenshot({
    path: outPath,
    fullPage,
    clip,
    omitBackground,
  });

  const result = await maxWidthGuard(outPath, { label });
  if (result.downscaled) {
    console.log(`[captureHelpers] downscaled: ${path.basename(outPath)} ${result.originalWidth} -> ${result.finalWidth}`);
  }
  return { ...result, outPath };
}

/**
 * Locate an element by selector, compute its bounding rect, clamp clip
 * width to MAX_SAFE_WIDTH, and call safeScreenshot with that clip.
 *
 * Returns the final clip rect used (post-clamp) or null if the selector
 * matched nothing.
 */
async function safeCrop(page, selector, outPath, opts = {}) {
  const { padding = 0, label = 'safe' } = opts;
  const box = await page.evaluate(({ sel, pad }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.floor(r.left - pad)),
      y: Math.max(0, Math.floor(r.top - pad)),
      width: Math.ceil(r.width + pad * 2),
      height: Math.ceil(r.height + pad * 2),
    };
  }, { sel: selector, pad: padding });

  if (!box) {
    console.warn(`[captureHelpers] safeCrop: selector not found: ${selector}`);
    return null;
  }

  // Clamp clip width pre-capture so Playwright never has to render an
  // off-viewport region. Height is left honest; tall narrow strips are
  // fine for Claude to read.
  if (box.width > MAX_SAFE_WIDTH) {
    box.width = MAX_SAFE_WIDTH;
  }

  const result = await safeScreenshot(page, outPath, { clip: box, label });
  return { ...box, ...result };
}

/**
 * Convenience: full-page capture that asserts SAFE_VIEWPORT was used.
 * Use this when you want the whole scroll height of a page captured for
 * review purposes — DSF stays at 1, so even tall pages stay narrow.
 */
async function boundedFullPage(page, outPath, opts = {}) {
  const { label = 'safe' } = opts;
  return safeScreenshot(page, outPath, { fullPage: true, label });
}

/**
 * Write a JSON summary listing every PNG produced in a capture run.
 * Each entry: { file, originalWidth, finalWidth, downscaled }.
 *
 * The protocol requires final_width <= MAX_SAFE_WIDTH for every entry
 * whose label is not 'retina-review'. Operators read this file after
 * every capture batch to confirm no PNG slipped past the clamp.
 */
function writeCaptureSummary(outDir, entries) {
  const summaryPath = path.join(outDir, '_summary.json');
  const payload = {
    generated_at: new Date().toISOString(),
    max_safe_width: MAX_SAFE_WIDTH,
    safe_viewport: SAFE_VIEWPORT,
    entries,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2));
  console.log(`[captureHelpers] wrote ${summaryPath}`);
  return summaryPath;
}

module.exports = {
  MAX_SAFE_WIDTH,
  SAFE_VIEWPORT,
  RETINA_REVIEW_VIEWPORT,
  createSafeContext,
  safeScreenshot,
  safeCrop,
  boundedFullPage,
  maxWidthGuard,
  writeCaptureSummary,
  readDefaultToken,
};
