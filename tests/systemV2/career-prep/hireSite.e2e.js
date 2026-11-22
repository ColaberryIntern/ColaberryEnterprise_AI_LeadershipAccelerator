/**
 * Career Prep v27, Releases 2 and 3: the hire.refactored.ai pages in a real browser (Edge), against the BUILT hire site
 * (apps/hire-refactored-public/dist, `node build.js` first) with the platform API answered from fixtures by page.route.
 * Nothing here can reach production: every request to the platform API is answered (or refused) in the browser.
 *
 * Checks:
 *   HS1 (CP8.2) the booking page lists the open times by day (Central, with the booker's zone beside), shows the
 *       first name, role, length and recording notice, and a DOUBLE click on Confirm sends ONE request and shows
 *       "Booked" with the consent-room page link; no provider link anywhere on the page
 *   HS2 (CP8.2) a used link shows the plain "already used" page and offers no times
 *   HS3 (CP8.2) the booking page fits a phone (390 wide): no horizontal scroll, every time button at least 44px tall
 *   HS4 (CP9.1) the employer room shows the guide and saves a note: the consent screen names recording AND AI scoring
 *       of the candidate's voice and words, says any no = unrecorded with no replay, gives No the same button as Yes,
 *       shows NO meeting link until a (double-clicked: ONE request) decision; the guide lists the role's questions;
 *       a double-clicked Save sends ONE note (one key) and lists it
 *   HS5 (CP9.1) the employer room fits a phone (390 wide): no horizontal scroll, every control at least 44px tall
 *   HS6 (CP10.2) "client portal matches the design inventory": the sign-in link is redeemed once and leaves the address
 *       bar; each candidate card shows initials, name, role, status pill, readiness, verified projects and the 4
 *       actions; Offers and fees shows the 3 KPIs, the 7-column table and the fee callout; Make an offer shows Yearly /
 *       Hourly, hours default 40, start and respond-by dates, the calculation, the agreement box, Send disabled, the
 *       follow-up box on; the four screenshots exist (client-candidates-1440, -offers-1440, -make-offer-1440,
 *       client-candidates-390, in SHOTS_DIR)
 *   HS7 (CP10.2) "client portal: Send disabled until agreed; hourly $50 x 40 shows $104,000 and $114,400"; a double
 *       click on Send sends ONE offer, agreed, with no fee from the page
 *   HS8 (CP10.2) the portal fits a phone (390 wide): no horizontal scroll, every action at least 44px tall
 *   HS9 (CP10.2) a spent or unknown sign-in link shows the plain message, leaves the address bar, asks for no data
 *   HSX zero console errors in these flows
 *
 * Env: HIRE_DIR (default apps/hire-refactored-public/dist), HIRE_PORT (default 3171), PW_CHANNEL (default msedge),
 * SHOTS_DIR (default the loop run's shots/ folder).
 * Usage (repo root): node tests/systemV2/career-prep/hireSite.e2e.js, or runAll.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { check, results, shot } = require('./harness');
const { clientPage, inventory, save, T, SHOTS, CLIENT_SHOTS, OFFER_COLS, ROOM: CLIENT_ROOM } = require('./fakeClient');

const DIR = path.resolve(process.env.HIRE_DIR || path.join(__dirname, '..', '..', '..', 'apps', 'hire-refactored-public', 'dist'));
const PORT = Number(process.env.HIRE_PORT || 3171);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const TOKEN = 'Q'.repeat(43);
const USED = 'U'.repeat(43);
const SENTINEL = 'https://zoom.example/j/SECRET';
const ROOM = 'https://hire.refactored.ai/room/?i=iv-1&e=1795447800000&t=' + 'S'.repeat(43);
const VIEW = { candidate: 'Ann', company: 'Acme', position: 'Data Analyst', minutes: 30, recordingNotice: 'It is recorded only if everyone agrees when it starts.', timezone: 'America/Chicago', reason: null,
  slots: [['2026-11-23T15:00:00.000Z', 'Mon, Nov 23, 9:00 AM CST', 'Mon, Nov 23, 7:00 AM PST'], ['2026-11-23T15:30:00.000Z', 'Mon, Nov 23, 9:30 AM CST', 'Mon, Nov 23, 7:30 AM PST'],
    ['2026-11-24T21:00:00.000Z', 'Tue, Nov 24, 3:00 PM CST', 'Tue, Nov 24, 1:00 PM PST']].map(([startsAt, central, local]) => ({ startsAt, central, local })) };

function serve() {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) throw new Error(`no hire build at ${DIR}: run node apps/hire-refactored-public/build.js first`);
  return http.createServer((req, res) => {
    let file = path.normalize(path.join(DIR, decodeURIComponent((req.url || '/').split('?')[0])));
    if (file.startsWith(DIR) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(DIR) || !fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/html' }); res.end(fs.readFileSync(path.join(DIR, '404.html'))); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1');
}

/** A page whose platform API is the fixture: page data per token, and a confirm that counts its requests. */
async function bookingPage(browser, token, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, timezoneId: 'America/Los_Angeles' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  const confirms = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/^https:\/\/enterprise\.colaberry\.ai\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } });
    if (url.pathname === `/api/public/booking/${TOKEN}/confirm`) {
      confirms.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 300)); // a slow answer, so a second click lands while the first is in flight
      return json(200, { booked: { startsAt: confirms[0].slot, minutes: 30, roomPage: ROOM }, replay: confirms.length > 1 });
    }
    if (url.pathname === `/api/public/booking/${TOKEN}`) return json(200, { booking: VIEW });
    if (url.pathname === `/api/public/booking/${USED}`) return json(410, { error: 'This booking link was already used to book a time.', reason: 'used' });
    return route.abort();
  });
  await page.goto(`${BASE}/book/?t=${token}`);
  return { ctx, page, errors, confirms };
}

const IID = '11111111-1111-4111-8111-111111111111';
const LINK = `?i=${IID}&e=1795447800000&t=${'S'.repeat(43)}`;
const QUESTIONS = ['Walk me through a pipeline you built.', 'How do you check a forecast before it reaches a customer?'];

/** The employer room's API as the fixture (the server's shapes): a decision, the guide, and notes keyed per Save. */
async function roomPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1600, height: 960 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = []; const decisions = []; const saves = []; const notes = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const view = () => { const d = decisions[0] || null; const n = d === 'consent' ? 1 : 0;
    return { room: { interviewId: IID, you: 'employer', company: 'Acme', role: 'Data Analyst', startsAt: '2026-11-23T15:00:00.000Z', endsAt: '2026-11-23T15:30:00.000Z',
      opensAt: '2026-11-23T14:50:00.000Z', yourDecision: d, consent: { consented: n, of: 2, declined: d === 'decline', label: `RECORDING ${n} OF 2 CONSENTED` }, recording: { status: 'off', note: null },
      join: d ? { status: 'ready', url: SENTINEL, reason: null } : { status: 'decide_first', url: null, reason: 'Choose first.' } } }; };
  const guide = () => ({ company: 'Acme', role: 'Data Analyst', questions: QUESTIONS, notes: notes.map((x) => ({ id: x.id, body: x.body, at: '2026-11-23T15:05:00.000Z' })) });
  await page.route(/^https:\/\/enterprise\.colaberry\.ai\/.*/, async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST' } });
    if (url.searchParams.get('t') !== 'S'.repeat(43)) return json(401, { error: 'This room link is not valid.', reason: 'invalid' });
    await new Promise((r) => setTimeout(r, 250)); // a slow answer, so a second click lands while the first is in flight
    if (url.pathname === `/api/public/room/${IID}/consent`) { decisions.push(req.postDataJSON().decision); return json(200, view()); }
    if (url.pathname === `/api/public/room/${IID}`) return json(200, view());
    if (url.pathname === `/api/public/room/${IID}/guide`) return json(200, { guide: guide() });
    if (url.pathname === `/api/public/room/${IID}/notes`) {
      const b = req.postDataJSON(); saves.push(b);
      const had = notes.find((x) => x.key === b.key);
      if (!had) notes.push({ id: String(notes.length + 1), key: b.key, body: b.body });
      return json(had ? 200 : 201, { note: { id: '1', body: b.body, at: '2026-11-23T15:05:00.000Z' }, replay: !!had, guide: guide() });
    }
    return route.abort();
  });
  await page.goto(`${BASE}/room/${LINK}`);
  return { ctx, page, errors, decisions, saves, notes };
}

async function runRoom(browser, all) {
  const name = 'HS4 employer room shows the guide and saves a note';
  const r = await roomPage(browser);
  try {
    await r.page.waitForSelector('[data-decide]');
    await r.page.waitForSelector('#side .qs li');
    const before = await r.page.evaluate(() => ({ text: document.querySelector('#panel')?.textContent || '', rec: document.querySelector('#rec')?.textContent,
      cls: [...document.querySelectorAll('[data-decide]')].map((b) => b.className), sizes: [...document.querySelectorAll('[data-decide]')].map((b) => Math.round(b.getBoundingClientRect().width)),
      open: !!document.querySelector('#open'), zoom: /zoom\.example/.test(document.documentElement.outerHTML), qs: [...document.querySelectorAll('#side .qs li')].map((li) => li.textContent) }));
    await shot(r.page, 'iroom-employer-1600');
    await r.page.locator('[data-decide="consent"]').dblclick();
    await r.page.waitForSelector('#open');
    const href = await r.page.getAttribute('#open', 'href');
    await r.page.fill('#note', 'Clear on trade-offs; ask about monitoring next round.');
    await r.page.locator('#save').dblclick();
    await r.page.waitForSelector('#notes li');
    const after = await r.page.evaluate(() => ({ notes: [...document.querySelectorAll('#notes li p')].map((p) => p.textContent), draft: document.querySelector('#note')?.value }));
    await shot(r.page, 'iroom-employer-1600-after');
    check(name, /AI scores the candidate's voice and words/.test(before.text) && /scores the audio only; it never analyzes the video/.test(before.text) && /not recorded, nothing is scored, and the candidate gets no replay/.test(before.text)
      && before.rec === 'RECORDING 0 OF 2 CONSENTED' && before.cls.length === 2 && before.cls[0] === before.cls[1] && before.sizes[0] === before.sizes[1] && !before.open && !before.zoom
      && before.qs.join('|') === QUESTIONS.join('|') && r.decisions.join() === 'consent' && href === SENTINEL
      && r.saves.length === 1 && r.notes.length === 1 && after.notes.join() === 'Clear on trade-offs; ask about monitoring next round.' && after.draft === '',
    JSON.stringify({ rec: before.rec, cls: before.cls, sizes: before.sizes, open: before.open, zoom: before.zoom, qs: before.qs.length, decisions: r.decisions, saves: r.saves.length, after }).slice(0, 300));
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...r.errors); await r.ctx.close();

  const p = await roomPage(browser, { width: 390, height: 844 });
  try {
    await p.page.waitForSelector('#side .qs li');
    await shot(p.page, 'iroom-employer-390');
    const m = await p.page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth,
      minH: Math.min(...[...document.querySelectorAll('[data-decide], #save')].map((b) => b.getBoundingClientRect().height)) }));
    check('HS5 the employer room fits a phone (390): no sideways scroll, 44px targets', m.over <= 0 && m.minH >= 44, `overflow ${m.over}px, smallest control ${Math.round(m.minH)}px`);
  } catch (e) { check('HS5 the employer room fits a phone (390): no sideways scroll, 44px targets', false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...p.errors); await p.ctx.close();
}

async function runClient(browser, all, base) {
  const name = 'HS6 client portal matches the design inventory';
  const c = await clientPage(browser, base);
  try {
    const { cards, ivs, offers, form } = await inventory(c);
    const ph = await clientPage(browser, base, { viewport: { width: 390, height: 844 } });
    try { await ph.page.waitForSelector(T('cand-card')); await save(ph.page, 'client-candidates-390'); } finally { all.push(...ph.errors); await ph.ctx.close(); }
    const shots = CLIENT_SHOTS.filter((s) => !fs.existsSync(path.join(SHOTS, `${s}.png`)));
    check(name, cards.search === '' && c.redeems.length === 1 && cards.n === 2 && cards.missing.length === 0 && /72/.test(cards.first) && /Freight ETA forecasting/.test(cards.first)
      && offers.kpis.join('|') === 'Offers out 1|Accepted 1|Fees on accepted offers $114,400 110% of first-year salary' && offers.cols.join('|') === OFFER_COLS.join('|')
      && /110% of the first-year salary/.test(offers.callout || '') && form.yearly && form.hourly === 'true' && form.hours === '40' && form.start === 'date' && form.respond === 'date'
      && form.calc && form.agree === false && form.send === true && form.follow === true && shots.length === 0
      && ivs.join.join('|') === CLIENT_ROOM && !ivs.pwned && /onerror/.test(ivs.text) && !/zoom\.example/.test(ivs.text),
    `address "${cards.search}", ${cards.n} cards, missing [${cards.missing.join(',')}], join [${ivs.join.length}], script ran ${ivs.pwned}, kpis [${offers.kpis.join('|')}], cols ${offers.cols.length}, hours ${form.hours}, send disabled ${form.send}, missing shots [${shots.join(',')}]`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
  await runOfferSend(browser, all, base);
  await runClientPhone(browser, all, base);
  await runBadLink(browser, all, base);
}

async function runBadLink(browser, all, base) {
  const name = 'HS9 a spent or unknown sign-in link: the plain message, the address bar cleared, no data asked for';
  const c = await clientPage(browser, base, { token: '0f0f0f0f-1111-4111-8111-999999999999' });
  try {
    await c.page.waitForSelector(T('signin-msg'));
    const s = await c.page.evaluate(() => ({ search: location.search, msg: document.querySelector('[data-testid="signin-msg"]').textContent, cards: document.querySelectorAll('[data-testid="cand-card"]').length }));
    check(name, s.search === '' && /no longer valid/.test(s.msg) && s.cards === 0 && c.redeems.length === 1, `address "${s.search}", "${s.msg.slice(0, 60)}"`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  // The redeem 401 is the answer under test (the browser logs every non-2xx response).
  all.push(...c.errors.filter((e) => !/status of 401/.test(e))); await c.ctx.close();
}

async function runOfferSend(browser, all, base) {
  const name = 'HS7 client portal: Send disabled until agreed; hourly $50 x 40 shows $104,000 and $114,400';
  const c = await clientPage(browser, base);
  try {
    await c.page.waitForSelector(T('cand-card'));
    await c.page.click(`${T('cand-card')} ${T('act-offer')}`);
    await c.page.click(T('basis-hourly'));
    await c.page.fill(T('offer-rate'), '50');
    const calc = await c.page.evaluate(() => [document.querySelector('[data-testid="calc-first-year"]')?.textContent, document.querySelector('[data-testid="calc-fee"]')?.textContent]);
    const before = await c.page.locator(T('offer-send')).isDisabled();
    await c.page.check(T('offer-agree'));
    const after = await c.page.locator(T('offer-send')).isDisabled();
    await c.page.locator(T('offer-send')).dblclick();
    await c.page.waitForSelector(T('notice'));
    const b = c.posts[0] || {};
    check(name, calc.join('|') === '$104,000|$114,400' && before === true && after === false && c.posts.length === 1 && b.agreed === true && b.pay.rateCents === 5000 && b.pay.hoursPerWeek === 40
      && !/fee/i.test(Object.keys(b).join(',') + Object.keys(b.pay || {}).join(',')),
    `calc ${calc.join(' / ')}, disabled before ${before}, after ${after}, ${c.posts.length} offer request(s)`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

async function runClientPhone(browser, all, base) {
  const name = 'HS8 the employer portal fits a phone (390): no sideways scroll, 44px targets';
  const c = await clientPage(browser, base, { viewport: { width: 390, height: 844 } });
  try {
    await c.page.waitForSelector(T('cand-card'));
    const m = await c.page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth,
      minH: Math.min(...[...document.querySelectorAll('.cp-acts .btn, .cp-tabs button')].map((b) => b.getBoundingClientRect().height)) }));
    check(name, m.over <= 0 && m.minH >= 44, `overflow ${m.over}px, smallest control ${Math.round(m.minH)}px`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

async function run(browser) {
  const all = [];
  for (const s of CLIENT_SHOTS) fs.rmSync(path.join(SHOTS, `${s}.png`), { force: true }); // HS6 must make each one fresh
  const a = await bookingPage(browser, TOKEN);
  try {
    await a.page.waitForSelector('[data-slot]');
    const listed = await a.page.evaluate(() => ({ h: document.querySelector('#panel h2')?.textContent, days: [...document.querySelectorAll('.day h3')].map((x) => x.textContent),
      times: document.querySelectorAll('[data-slot]').length, local: document.querySelector('[data-slot] span')?.textContent, text: document.body.innerText }));
    await a.page.click('[data-slot="2026-11-23T15:30:00.000Z"]');
    await a.page.locator('#confirm').dblclick();
    await a.page.waitForSelector('.room a');
    const after = await a.page.evaluate(() => ({ h: document.querySelector('#panel h2')?.textContent, room: document.querySelector('.room a')?.getAttribute('href'), html: document.documentElement.outerHTML }));
    check('HS1 booking page lists slots and confirms once', listed.h === 'Book your interview with Ann' && listed.times === 3 && listed.days.join('|') === 'Mon, Nov 23|Tue, Nov 24'
      && listed.local === '7:00 AM PST your time' && listed.text.includes('Data Analyst at Acme, 30 minutes') && listed.text.includes('recorded only if everyone agrees')
      && a.confirms.length === 1 && a.confirms[0].slot === '2026-11-23T15:30:00.000Z' && a.confirms[0].tz === 'America/Los_Angeles'
      && after.h === 'Booked' && after.room === ROOM && !after.html.includes(SENTINEL),
    `heading "${listed.h}", ${listed.times} times, ${a.confirms.length} confirm request(s), then "${after.h}"`);
  } catch (e) { check('HS1 booking page lists slots and confirms once', false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...a.errors); await a.ctx.close();

  const u = await bookingPage(browser, USED);
  try {
    await u.page.waitForFunction(() => /already used/.test(document.querySelector('#panel h2')?.textContent || ''));
    const s = await u.page.evaluate(() => ({ times: document.querySelectorAll('[data-slot]').length, text: document.querySelector('#panel')?.textContent }));
    check('HS2 a used booking link shows the plain already-used page', s.times === 0 && s.text.includes('This booking link was already used to book a time.'), `${s.times} times shown`);
  } catch (e) { check('HS2 a used booking link shows the plain already-used page', false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...u.errors); await u.ctx.close();

  const p = await bookingPage(browser, TOKEN, { width: 390, height: 844 });
  try {
    await p.page.waitForSelector('[data-slot]');
    const m = await p.page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, minH: Math.min(...[...document.querySelectorAll('[data-slot]')].map((b) => b.getBoundingClientRect().height)) }));
    check('HS3 the booking page fits a phone (390): no sideways scroll, 44px targets', m.over <= 0 && m.minH >= 44, `overflow ${m.over}px, smallest time button ${Math.round(m.minH)}px`);
  } catch (e) { check('HS3 the booking page fits a phone (390): no sideways scroll, 44px targets', false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...p.errors); await p.ctx.close();

  await runRoom(browser, all);
  await runClient(browser, all, BASE);

  // The used link's 410 is the answer under test (the browser logs every non-2xx response); nothing else is allowed.
  const real = all.filter((e) => !/fonts\.(googleapis|gstatic)/.test(e) && !/status of 410 \(Gone\)/.test(e));
  check('HSX zero console errors in these flows', real.length === 0, real.slice(0, 2).join(' | ').slice(0, 200));
}

(async () => {
  let server;
  try {
    server = serve();
    const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
    try { await run(browser); } finally { await browser.close(); }
  } catch (e) {
    check('suite ran to the end', false, String(e && e.message).slice(0, 300));
  } finally { if (server) server.close(); }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length || results.length < 6 ? 1 : 0);
})();
