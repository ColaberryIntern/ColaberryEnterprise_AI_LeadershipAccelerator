/**
 * Capture the L7.2 live-link landing page from PRODUCTION, in both the states a real
 * session can be in today.
 *
 * Why these two session ids and not a mock: both are real rows in `live_sessions` on
 * production, and the moment each one renders was read back from the live API before
 * capturing. A fabricated id would still render a convincing page, which is exactly why
 * it would not be evidence.
 *
 * Each capture asserts the headline it expected is actually on the page. A screenshot of
 * a page that silently rendered the wrong state looks identical to a correct one in a PDF.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot } = require('./captureHelpers');

const ORIGIN = process.env.CAPTURE_ORIGIN || 'https://enterprise.colaberry.ai';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', '2026-10-23-l72-live-links');

const STOPS = [
  {
    file: '01-not-started.png',
    sessionId: 'babd64c9-23ef-409e-aa56-11695ce1524a',
    expectMoment: 'not_started',
    expectText: 'has not started yet',
  },
  {
    file: '02-ended.png',
    sessionId: '7aa7ce89-187d-4604-9b86-a3b2a69579ce',
    expectMoment: 'ended',
    expectText: 'has ended',
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // No token: these routes are public by design, and capturing them signed out is the
  // point - a promoted link is clicked by people who have never logged in.
  const ctx = await createSafeContext(browser, { token: null });
  const page = await ctx.newPage();

  for (const stop of STOPS) {
    const api = await page.request.get(`${ORIGIN}/api/portal/sessions/${stop.sessionId}/live-moment`);
    const body = await api.json();
    if (body.moment !== stop.expectMoment) {
      throw new Error(`${stop.file}: API says moment=${body.moment}, expected ${stop.expectMoment}`);
    }

    await page.goto(`${ORIGIN}/portal/live/${stop.sessionId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="live-session-title"]', { timeout: 15000 });
    const title = (await page.textContent('[data-testid="live-session-title"]')) || '';
    if (!title.includes(stop.expectText)) {
      throw new Error(`${stop.file}: page says "${title.trim()}", expected to contain "${stop.expectText}"`);
    }

    const out = path.join(OUT, stop.file);
    await safeScreenshot(page, out);
    console.log(`${stop.file.padEnd(22)} moment=${body.moment.padEnd(12)} "${title.trim()}"`);
  }

  await browser.close();
  console.log('\nwrote to ' + OUT);
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
