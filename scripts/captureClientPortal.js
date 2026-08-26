/**
 * captureClientPortal — screenshot the signed-in client surface on DEV.
 *
 * DEV ONLY. The base URL is the dev instance on :9999 and there is no production target
 * in this file, deliberately: the seeded engagement it depends on exists only there.
 *
 * Unlike `captureRefactoredDeliveryOs.js`, this one injects a **client** session
 * (`delivery_client_token`), not an admin JWT. That is the whole point — the admin token
 * cannot reach this surface, and a screenshot taken with one would prove nothing about
 * what a client actually sees.
 *
 * Pass the token as argv[2] or via CLIENT_TOKEN. It is never written to disk here, and
 * never printed: the token is a live 8-hour session, and a capture script is not a place
 * to leak one.
 *
 * Usage:  node scripts/captureClientPortal.js <token>
 */

const path = require('path');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  writeCaptureSummary,
} = require('./captureHelpers');

const BASE_URL = 'http://95.216.199.47:9999';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'refactored-client-portal-dev');

const STOPS = [
  { file: '01-client-signin', url: '/client', label: 'Client sign-in (public door)', signedOut: true },
  { file: '02-client-projects', url: '/client/projects', label: 'Client portal - signed in' },
];

async function main() {
  const token = process.argv[2] || process.env.CLIENT_TOKEN || '';
  if (!token) throw new Error('Usage: node scripts/captureClientPortal.js <client token>');

  const browser = await chromium.launch();
  const consoleErrors = [];
  const entries = [];

  for (const stop of STOPS) {
    // A fresh context per stop so the signed-out door is genuinely signed out rather than
    // relying on clearing state that a previous stop set.
    const context = await createSafeContext(browser);
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${stop.file}: ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleErrors.push(`${stop.file}: pageerror ${e.message}`));

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!stop.signedOut) {
      await page.evaluate((t) => {
        try {
          window.localStorage.setItem('delivery_client_token', t);
        } catch (_) {
          /* private mode - the page will render its signed-out state, which is honest */
        }
      }, token);
    }

    await page.goto(`${BASE_URL}${stop.url}`, { waitUntil: 'networkidle', timeout: 45_000 });
    // The portal fetches after mount; networkidle covers it, but give React a beat to
    // commit the rendered rows so the screenshot is not of a loading state.
    await page.waitForTimeout(1200);

    const file = path.join(OUT_DIR, `${stop.file}.png`);
    await safeScreenshot(page, file, { fullPage: true, label: stop.label });
    console.log(`[shot] ${stop.label} -> ${stop.file}.png`);
    entries.push({ file: `${stop.file}.png`, label: stop.label, url: stop.url });

    await context.close();
  }

  await browser.close();
  console.log(`\n[console] ${consoleErrors.length} error(s)`);
  consoleErrors.forEach((e) => console.log(`  ${e}`));
  writeCaptureSummary(OUT_DIR, entries);
}

main().catch((err) => {
  console.error(`[capture] FAILED: ${err.message}`);
  process.exit(1);
});
