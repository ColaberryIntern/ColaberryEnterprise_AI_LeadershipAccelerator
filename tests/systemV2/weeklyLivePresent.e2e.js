/**
 * weeklyLivePresent.e2e.js: browser proof that a GENERATED Weekly Live deck works through Present
 * (Basecamp WL4.2).
 *
 *     PW_CHANNEL=msedge node tests/systemV2/weeklyLivePresent.e2e.js
 *
 * It builds a deck from the test blueprint with the real renderer, injects the live connection with the
 * real injectCustomDeckLive (what the Accelerator's Present button serves), and writes it into a blank
 * tab the way the Present button does. Then it walks every slide and checks what the deck broadcasts to
 * attendee screens: a follow-along card on every slide, phase 'prompt' with the prompt text on hands-on
 * slides (Run it here), phase 'question' on poll slides, the QR in the lobby, and the presenter side
 * window. Every request is intercepted: no server, no real data. Exit 1 on any failure.
 */
const path = require('path');
require(process.env.TS_NODE_PATH || 'ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const PW = require(process.env.PW_PATH || 'playwright');

const backend = path.join(__dirname, '..', '..', 'backend', 'src');
const { renderDeck } = require(path.join(backend, 'services/weeklyLive/deck/deckRender'));
const { sampleBlueprint } = require(path.join(backend, 'services/weeklyLive/deck/__tests__/sampleBlueprint'));
const { injectCustomDeckLive } = require(path.join(backend, 'services/classKit/customDeck'));

const results = [];
const check = (name, ok, detail = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

(async () => {
  const bp = sampleBlueprint();
  const { html } = renderDeck({ blueprint: bp, title: 'Stop Doing It Nightly', episode: 'Week 8', dateLabel: 'Monday, December 7', siteUrl: 'https://site.test' });
  const live = injectCustomDeckLive(html, {
    enabled: true, sessionId: 's1', liveStateUrl: 'https://api.test/live-state', broadcastUrl: 'https://api.test/broadcast', token: 'tok',
    checkinUrl: 'https://site.test/checkin/s1', qrSvg: '<svg data-test="qr" width="10" height="10"></svg>',
  });

  const browser = await PW.chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sent = []; const errors = [];
  await ctx.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith('https://api.test/broadcast')) { sent.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    if (u.startsWith('https://api.test/live-state')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ present: 3, poll: null }) });
    if (u.startsWith('https://site.test/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) });
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('about:blank');
  await page.evaluate((doc) => { document.open(); document.write(doc); document.close(); }, live);
  await page.waitForTimeout(500);

  check('the deck has one section per slide', (await page.locator('section.slide').count()) === bp.slides.length);
  check('the QR from the platform is in the lobby', (await page.locator('[data-oh="lobby"] [data-test="qr"]').count()) === 1);
  check('the check-in link is shown', (await page.locator('[data-checkin]').first().textContent()).includes('site.test/checkin/s1'));
  check('slide 1 broadcast on load', sent.length >= 1 && sent[0].slide_index === 0);

  const popupP = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
  for (let k = 1; k < bp.slides.length; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); }
  const popup = await popupP;
  await page.waitForTimeout(400);

  const bySlide = new Map(); for (const b of sent) bySlide.set(b.slide_index, b);
  check('every slide broadcast', bySlide.size === bp.slides.length, `${bySlide.size} of ${bp.slides.length}`);
  bp.slides.forEach((s, k) => {
    const b = bySlide.get(k) || {};
    check(`slide ${k + 1} (${s.kind}) carries its follow card`, b.follow && b.follow.heading === s.follow.heading);
    if (s.prompt) check(`slide ${k + 1} sends Run it here with its prompt`, b.phase === 'prompt' && b.prompt && b.prompt.prompt === s.prompt.text);
    else if (s.poll) check(`slide ${k + 1} opens its vote`, b.phase === 'question' && b.question && b.question.key === s.poll.key);
    else check(`slide ${k + 1} is a status slide`, b.phase === 'status');
  });
  check('presenter notes travel with the broadcast', (bySlide.get(6) || {}).presenter_tip?.includes(bp.slides[6].say[0]));
  check('every broadcast carries one Weekly Live deck id', new Set(sent.map((b) => b.deck_id)).size === 1 && /^wl-/.test(sent[0].deck_id) && sent[0].slide_id === 'wl-0');
  check('the presenter side window opened', Boolean(popup));
  if (popup) {
    await popup.waitForTimeout(300);
    const text = await popup.locator('#pv').textContent();
    check('the presenter window shows next week and what to say', text.includes(bp.slides[bp.slides.length - 1].title) && text.includes('Say these'));
  }
  check('no script errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
