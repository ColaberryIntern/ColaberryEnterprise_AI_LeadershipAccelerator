/**
 * captureDrawerVariants.js
 *
 * Sister script to captureProductionScreenshots.js. Loads /portal/home,
 * clicks each interactive surface (Readiness tile, Coverage tile,
 * "Why this next?" button, Cory whisper in the context bar), and
 * captures one PNG per drawer state. Output to docs/screenshots/<out>/.
 *
 * Routed through scripts/captureHelpers.js so every PNG stays under
 * the Claude many-image dimension ceiling.
 *
 * Usage:  node scripts/captureDrawerVariants.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  writeCaptureSummary,
  readDefaultToken,
} = require('./captureHelpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.CAPTURE_OUT || path.join(REPO_ROOT, 'docs', 'screenshots', `${new Date().toISOString().slice(0, 10)}-drawers`);
const TOKEN = readDefaultToken();

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await createSafeContext(browser, { token: TOKEN, label: 'safe' });
  const page = await context.newPage();
  const entries = [];

  console.log(`[drawers] Out: ${OUT_DIR}`);
  await page.goto(`${BASE}/portal/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const variants = [
    { slug: 'drawer-readiness', label: 'Readiness drawer', openClick: 'button:has-text("Readiness")' },
    { slug: 'drawer-coverage', label: 'Coverage drawer', openClick: 'button:has-text("Coverage")' },
    { slug: 'drawer-why-this-next', label: 'Why this next drawer', openClick: 'button:has-text("Why this next?")' },
    { slug: 'drawer-cory', label: 'Cory whisper drawer', openClick: 'button[title*="click for full context"]', fallbackClick: '.bi-stars' },
  ];

  for (const v of variants) {
    console.log(`[drawers] ${v.label}…`);
    try {
      await page.click(v.openClick, { timeout: 5000 });
    } catch (e) {
      if (v.fallbackClick) {
        await page.click(v.fallbackClick, { timeout: 5000 }).catch(e2 => console.log(`  fallback click failed: ${e2.message}`));
      } else {
        console.log(`  ${v.slug} click failed: ${e.message}`);
      }
    }
    await page.waitForTimeout(900);
    const out = path.join(OUT_DIR, `${v.slug}.png`);
    const shotInfo = await safeScreenshot(page, out, { fullPage: false, label: 'safe' });
    entries.push({
      slug: v.slug,
      label: v.label,
      file: path.basename(out),
      originalWidth: shotInfo.originalWidth,
      finalWidth: shotInfo.finalWidth,
      downscaled: shotInfo.downscaled,
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await browser.close();
  writeCaptureSummary(OUT_DIR, entries);
  console.log(`[drawers] Done. ${entries.length} drawer variants saved to ${OUT_DIR}`);
})();
