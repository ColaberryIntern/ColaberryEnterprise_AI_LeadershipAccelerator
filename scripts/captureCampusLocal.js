/**
 * Colaberry Campus screenshots per audience (C11), from the LOCAL e2e stack only (tests/systemV2/campus-stack.md).
 *
 * For member, Explorer, business and staff, at desktop 1440x900 and phone 390x844: the portal home on the campus, and the
 * map opened at that audience's signature building (member: Community Lounge and Reese's desk; Explorer: the Main Gate and
 * Maya; business: Partner Office; staff: Staff Office). Each shot is DOM-checked before it is taken, so a picture of the
 * wrong thing fails the run instead of being attached. Widths go through captureHelpers (safe-width rule).
 *
 *   BASE_URL=http://localhost:3150 PW_PATH=<playwright> node scripts/captureCampusLocal.js <outDir>
 */
const fs = require('fs');
const path = require('path');
const { assertLocalOnly } = require('../tests/systemV2/lib/localOnly');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const { base } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150' });
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv[2] || 'tmp/campus-c11-shots');
const TOKENS = JSON.parse(fs.readFileSync(path.resolve(process.env.TOKENS_FILE || 'tmp/campus-e2e-tokens.json'), 'utf8'));

const SIGNATURE = {
  member: { building: 'commons', check: '[data-testid="cm-desk-reese"]' },
  explorer: { building: 'gate', check: '[data-testid="cm-desk-maya"]' },
  business: { building: 'career', check: '[data-testid="cm-card"][data-building="career"]' },
  staff: { building: 'career', check: '[data-testid="cm-card"][data-building="career"]' },
};
const SIZES = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const entries = [];
  let failures = 0;
  try {
    for (const audience of Object.keys(SIGNATURE)) {
      for (const size of SIZES) {
        const ctx = await createSafeContext(browser, { token: TOKENS.users[audience].jwt, viewport: { width: size.width, height: size.height, deviceScaleFactor: 1 } });
        await ctx.addInitScript(() => {
          try { localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' })); } catch { /* no storage */ }
        });
        const page = await ctx.newPage();
        try {
          await page.goto(`${base}/portal/today`, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForSelector(size.name === 'desktop' ? 'nav.cm-nav' : 'nav.cm-tabbar', { timeout: 30_000 });
          await page.waitForSelector('[data-testid="cm-banner"]', { timeout: 30_000 });
          const home = path.join(OUT, `${audience}-${size.name}-home.png`);
          entries.push({ audience, size: size.name, view: 'home', ...(await safeScreenshot(page, home)) });

          await page.click(size.name === 'desktop' ? '[data-testid="cm-open-map"]' : 'nav.cm-tabbar button');
          await page.waitForSelector('[data-testid="cm-overlay"]', { timeout: 15_000 });
          const sig = SIGNATURE[audience];
          await page.locator(`[data-testid="cm-overlay"] g[data-building="${sig.building}"]`).click();
          await page.waitForSelector(sig.check, { timeout: 15_000 });
          await page.waitForTimeout(300);
          const map = path.join(OUT, `${audience}-${size.name}-map.png`);
          entries.push({ audience, size: size.name, view: `map:${sig.building}`, ...(await safeScreenshot(page, map)) });
          console.log(`OK ${audience} ${size.name}`);
        } catch (e) {
          failures += 1;
          console.log(`FAIL ${audience} ${size.name}: ${e.message.split('\n')[0]}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeCaptureSummary(OUT, entries);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(JSON.stringify({ event: 'campus_capture_crashed', error_class: e.name, message: e.message })); process.exit(1); });
