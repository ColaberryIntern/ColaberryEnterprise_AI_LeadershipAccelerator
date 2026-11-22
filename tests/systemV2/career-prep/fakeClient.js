/**
 * Career Prep v27, CP10.2: the employer portal's API for the hire site browser checks (the server's shapes:
 * backend routes/hireClientRoutes.ts), answered by Playwright routing on the platform API host. The sign-in link's
 * token is redeemed once for a session; every data route needs that session (else the server's 401). Offers sent by
 * the page are recorded (`posts`), to prove a double click sends one and the page never sends a fee. Nothing here can
 * reach a real server: any other request to the API host is aborted.
 */
const fs = require('fs');
const path = require('path');
const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(__dirname, '..', '..', '..', '.loop-architect', 'runs', '20261121-career-prep-r2r3', 'shots'));
const CLIENT_SHOTS = ['client-candidates-1440', 'client-offers-1440', 'client-make-offer-1440', 'client-candidates-390'];
const LINK_TOKEN = '0f0f0f0f-1111-4111-8111-222222222222';
const SESSION = 'session-jwt';
const ANN = '11111111-0000-4000-8000-000000000001';
const PRIYA = '22222222-0000-4000-8000-000000000002';
const ROOM = `https://hire.refactored.ai/room/?i=33333333-0000-4000-8000-000000000003&e=1795447800000&t=${'S'.repeat(43)}`;

const candidates = () => ({ profilesUnavailable: false, feeRateBp: 11000, candidates: [
  { enrollmentId: ANN, name: 'Ann Lee', initials: 'AL', putForwardAt: '2026-11-16T15:00:00.000Z', readiness: 72,
    profile: { url: 'https://hire.refactored.ai/talent/ann-lee/', role: 'AI Solutions Analyst', verifiedProjects: ['Freight ETA forecasting', 'Dock schedule planner'], verifiedCount: 2 } },
  { enrollmentId: PRIYA, name: 'Priya Nair', initials: 'PN', putForwardAt: '2026-11-18T15:00:00.000Z', readiness: null, profile: null },
] });
const interviews = () => ({ interviews: [
  { id: '33333333-0000-4000-8000-000000000003', enrollmentId: ANN, candidateName: 'Ann Lee', company: 'Meridian Freight', role: 'AI Solutions Analyst', status: 'booked',
    startsAt: '2026-11-24T20:00:00.000Z', minutes: 45, joinPage: ROOM, recorded: false },
  { id: '44444444-0000-4000-8000-000000000004', enrollmentId: PRIYA, candidateName: 'Priya Nair', company: 'Meridian Freight', role: 'Data Analyst <img src=x onerror="window.__pwned=1">', status: 'not_booked',
    startsAt: null, minutes: null, joinPage: null, recorded: false },
] });
const offerRow = (over) => ({ id: '55555555-0000-4000-8000-000000000005', groupId: '66666666-0000-4000-8000-000000000006', version: 1, enrollmentId: ANN, candidateName: 'Ann Lee',
  role: 'AI Solutions Analyst', payBasis: 'yearly', salaryCents: 10500000, hourlyRateCents: null, hoursPerWeek: null, firstYearCents: 10500000, feeRateBp: 11000,
  feeCents: 11550000, startDate: '2027-01-04', respondBy: '2026-11-27T23:00:00.000Z', status: 'sent', invoiceStatus: null, sentAt: '2026-11-20T15:00:00.000Z', ...over });
const offers = (sent) => ({ offers: [
  ...sent,
  offerRow({ id: '77777777-0000-4000-8000-000000000007', enrollmentId: PRIYA, candidateName: 'Priya Nair', role: 'Data Analyst', payBasis: 'hourly', salaryCents: null,
    hourlyRateCents: 5000, hoursPerWeek: 40, firstYearCents: 10400000, feeCents: 11440000, startDate: '2026-12-07', status: 'accepted', invoiceStatus: 'not_invoiced' }),
  offerRow({}),
] });

/** A page on /client/ with the portal API answered; `link` false opens the page with no sign-in link. */
async function clientPage(browser, base, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = []; const posts = []; const redeems = []; const sent = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/^https:\/\/enterprise\.colaberry\.ai\/.*/, async (route) => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*' };
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'GET,POST' } });
    const p = url.pathname.replace(/^\/api\/hire\/client/, '');
    if (p === '/auth/redeem') { redeems.push(req.postDataJSON()); return req.postDataJSON().token === LINK_TOKEN && redeems.length === 1 ? json(200, { token: SESSION, expiresIn: 28800, clientName: 'Meridian Freight' }) : json(401, { error: 'This link is no longer valid.' }); }
    if (req.headers().authorization !== `Bearer ${SESSION}`) return json(401, { error: 'Please sign in again.' });
    if (p === '/candidates' && req.method() === 'GET') return json(200, candidates());
    if (p === '/interviews') return json(200, interviews());
    if (p === '/offers' && req.method() === 'GET') return json(200, offers(sent));
    if (p === '/offers' && req.method() === 'POST') {
      const b = req.postDataJSON(); posts.push(b);
      await new Promise((r) => setTimeout(r, 300)); // a slow answer, so a second click lands while the first is in flight
      const replay = posts.filter((x) => x.clientKey === b.clientKey).length > 1;
      const row = offerRow({ id: '88888888-0000-4000-8000-000000000008', enrollmentId: b.enrollmentId, role: b.role, payBasis: b.pay.basis, salaryCents: b.pay.salaryCents ?? null,
        hourlyRateCents: b.pay.rateCents ?? null, hoursPerWeek: b.pay.hoursPerWeek ?? null, firstYearCents: 10400000, feeCents: 11440000, sentAt: '2026-11-22T16:00:00.000Z' });
      if (!replay) sent.unshift(row);
      return json(replay ? 200 : 201, { offer: row, replay });
    }
    return route.abort();
  });
  await page.goto(`${base}/client/${opts.link === false ? '' : `?t=${opts.token || LINK_TOKEN}`}`);
  return { ctx, page, errors, posts, redeems };
}

const save = async (page, name) => { fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); };
const T = (id) => `[data-testid="${id}"]`;
const CARD_PARTS = ['cand-initials', 'cand-name', 'cand-role', 'cand-status', 'cand-readiness', 'cand-projects', 'act-resume', 'act-book', 'act-offer', 'act-followup'];
const OFFER_COLS = ['Candidate · role', 'Pay basis', 'First-year salary', 'Placement fee', 'Start date', 'Status', 'Invoice'];

/** HS6 measurements: the cards, the Offers and fees page and the Make an offer dialog, each by data-testid. */
async function inventory(c) {
  const page = c.page;
  await page.waitForSelector(T('cand-card'));
  const cards = await page.evaluate(([parts, t]) => ({ search: location.search, n: document.querySelectorAll(t).length,
    missing: [...document.querySelectorAll(t)].flatMap((card) => parts.filter((p) => !(card.querySelector(`[data-testid="${p}"]`)?.textContent || '').trim())),
    first: document.querySelector(t)?.innerText }), [CARD_PARTS, T('cand-card')]);
  await save(page, 'client-candidates-1440');
  await page.click('[data-view="interviews"]');
  await page.waitForSelector(T('interviews-table'));
  // The fixture's second interview role carries markup with a script hook: it must render as text, never run.
  const ivs = await page.evaluate(() => ({ join: [...document.querySelectorAll('[data-testid="interviews-table"] a')].map((a) => a.getAttribute('href')),
    pwned: window.__pwned === 1 || !!document.querySelector('img[src="x"]'), text: document.querySelector('[data-testid="interviews-table"]')?.textContent }));
  await page.click('[data-view="offers"]');
  await page.waitForSelector(T('offers-table'));
  const offers = await page.evaluate(() => { const t = (k) => `[data-testid="${k}"]`;
    return { kpis: ['kpi-out', 'kpi-accepted', 'kpi-fees'].map((k) => [...(document.querySelector(t(k))?.children || [])].map((x) => x.textContent.trim()).join(' ')),
      cols: [...document.querySelectorAll(`${t('offers-table')} th`)].map((th) => th.textContent.trim()), callout: document.querySelector(t('fee-callout'))?.textContent }; });
  await save(page, 'client-offers-1440');
  await page.click('.cp-title [data-act="offer"]');
  await page.waitForSelector(T('offer-form'));
  await page.click(T('basis-hourly'));
  const form = await page.evaluate(() => { const q = (k) => document.querySelector(`[data-testid="${k}"]`);
    return { yearly: !!q('basis-yearly'), hourly: q('basis-hourly')?.getAttribute('aria-pressed'), hours: q('offer-hours')?.value, start: q('offer-start')?.type, respond: q('offer-respond')?.type,
      calc: !!q('offer-calc'), agree: q('offer-agree')?.checked, send: q('offer-send')?.disabled, follow: q('offer-followup')?.checked }; });
  await save(page, 'client-make-offer-1440');
  return { cards, ivs, offers, form };
}
module.exports = { clientPage, inventory, save, T, SHOTS, CLIENT_SHOTS, OFFER_COLS, LINK_TOKEN, ROOM };
