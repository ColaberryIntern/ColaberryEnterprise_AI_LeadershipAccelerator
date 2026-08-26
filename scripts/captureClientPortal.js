/**
 * captureClientPortal — screenshot the signed-in client surface on DEV.
 *
 * Defaults to the dev instance on :9999, because the seeded engagement this depends on
 * exists only there. `CAPTURE_BASE` overrides it so the SIGNED-OUT surface can be checked
 * on production - which is the only thing worth capturing there, since production has no
 * memberships and no OAuth client, so no client session can exist yet.
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

const BASE_URL = process.env.CAPTURE_BASE || 'http://95.216.199.47:9999';
const OUT_DIR = path.join(
  __dirname, '..', 'docs', 'screenshots',
  process.env.CAPTURE_OUT_NAME || 'refactored-client-portal-dev',
);

const STOPS = [
  { file: '01-client-signin', url: '/client', label: 'Client sign-in (public door)', signedOut: true },
  { file: '02-client-overview', url: '/client/projects', label: 'Client portal - Overview' },
  { file: '03-client-decisions', url: '/client/projects', label: 'Client portal - Decisions', click: 'Decisions' },
  { file: '04-client-releases', url: '/client/projects', label: 'Client portal - Releases (empty state)', click: 'Releases' },
];

async function main() {
  const token = process.argv[2] || process.env.CLIENT_TOKEN || '';
  // No token is a legitimate run, not an error: on production there is no client session
  // to have. Capture the signed-out stops and say so, rather than refusing or - worse -
  // silently producing screenshots that look signed-in but are not.
  const stops = token ? STOPS : STOPS.filter((s) => s.signedOut);
  if (!token) console.log('[init] no token - capturing signed-out stops only');

  const browser = await chromium.launch();
  const consoleErrors = [];
  const entries = [];

  for (const stop of stops) {
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
    if (stop.click) {
      // Section rail buttons. Clicking proves the rail works rather than assuming it.
      await page.getByRole('button', { name: stop.click, exact: true }).first().click();
      await page.waitForTimeout(400);
    }

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
