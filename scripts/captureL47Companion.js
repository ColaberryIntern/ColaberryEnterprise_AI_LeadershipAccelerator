/**
 * Capture the phone companion from PRODUCTION, at phone width.
 *
 * WHAT THIS CAN AND CANNOT SHOW. The deck — the four status buttons, the poll, the prompt drop
 * — renders only while a class is on air, because that is the only time there is anything to
 * follow or answer. Nothing is airing, so this captures the states a viewer actually meets
 * today and NOT the deck itself. Photographing the deck requires a live broadcast; the first
 * chance is Test 3.
 *
 * AND IT IS AN EMULATED VIEWPORT, NOT A DEVICE. The ticket asks for a real phone and warns,
 * correctly, that narrow desktop width is not the same thing: sticky video and safe-area insets
 * behave differently on real hardware. This is the honest substitute, labelled as one.
 *
 * Each stop asserts the moment from the API before the shot and the headline off the DOM after,
 * so a page that silently rendered the wrong state cannot pass as the right one.
 */
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('playwright');

const ORIGIN = process.env.CAPTURE_ORIGIN || 'https://enterprise.colaberry.ai';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', '2026-10-24-l47-companion');

/** A real device profile rather than a hand-picked width, so the DPR and UA are coherent. */
const PHONE = devices['iPhone 13'];

const STOPS = [
  {
    file: '01-companion-not-started.png',
    sessionId: 'babd64c9-23ef-409e-aa56-11695ce1524a',
    expectMoment: 'not_started',
    expectText: 'has not started yet',
  },
  {
    file: '02-companion-ended.png',
    sessionId: '7aa7ce89-187d-4604-9b86-a3b2a69579ce',
    expectMoment: 'ended',
    expectText: 'has ended',
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // Signed out on purpose: a promoted link is scanned by people who have never logged in, and
  // that is the first impression the companion has to survive.
  const ctx = await browser.newContext({ ...PHONE, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  for (const stop of STOPS) {
    const api = await page.request.get(`${ORIGIN}/api/portal/sessions/${stop.sessionId}/live-moment`);
    const body = await api.json();
    if (body.moment !== stop.expectMoment) {
      throw new Error(`${stop.file}: API says moment=${body.moment}, expected ${stop.expectMoment}`);
    }

    await page.goto(`${ORIGIN}/portal/live/${stop.sessionId}/companion`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="live-session-title"]', { timeout: 15000 });
    const title = (await page.textContent('[data-testid="live-session-title"]')) || '';
    if (!title.includes(stop.expectText)) {
      throw new Error(`${stop.file}: page says "${title.trim()}", expected "${stop.expectText}"`);
    }

    // The deck must NOT be here: nothing is airing, and a deck on a class that has not started
    // would be a surface promising interaction it cannot deliver.
    const deck = await page.$('[data-testid="companion-deck"]');
    if (deck) throw new Error(`${stop.file}: the deck rendered on a class that is not live`);

    await page.screenshot({ path: path.join(OUT, stop.file) });
    const { width, height } = PHONE.viewport;
    console.log(`${stop.file.padEnd(32)} ${width}x${height}  moment=${body.moment.padEnd(12)} "${title.trim()}"`);
  }

  await browser.close();
  console.log('\nwrote to ' + OUT);
  console.log('NOT CAPTURED: the deck itself, which renders only while a class is on air.');
}
main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
