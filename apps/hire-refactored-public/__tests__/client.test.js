/**
 * The employer portal's rules (Career Prep CP10.2, kit "Employer portal"), from client-model.js and client-views.js:
 * the sign-in link and session, the live fee estimate (the server's formula), when Send may be pressed, the request
 * body, the cards, tables and KPIs. client-portal.js and client-offer.js only render these.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../src/assets/client-model.js');
const V = require('../src/assets/client-views.js');

const ANN = '11111111-0000-4000-8000-000000000001';
const BOB = '22222222-0000-4000-8000-000000000002';
const TOKEN = '0f0f0f0f-1111-4111-8111-222222222222';
const PROFILE = { url: 'https://hire.refactored.ai/talent/ann-lee/', role: 'AI Solutions Analyst', verifiedProjects: ['Freight ETA', 'Dock planner', 'Claims triage'], verifiedCount: 5 };
const cand = (over = {}) => ({ enrollmentId: ANN, name: 'Ann Lee', initials: 'AL', putForwardAt: '2026-11-20T15:00:00.000Z', readiness: 72, profile: PROFILE, ...over });
const offer = (over = {}) => ({ id: 'o1', groupId: 'g1', version: 1, enrollmentId: ANN, candidateName: 'Ann Lee', role: 'Data Lead', payBasis: 'yearly', salaryCents: 10500000,
  hourlyRateCents: null, hoursPerWeek: null, firstYearCents: 10500000, feeRateBp: 11000, feeCents: 11550000, startDate: '2027-01-04', respondBy: null, status: 'sent',
  invoiceStatus: null, sentAt: '2026-11-22T15:00:00.000Z', ...over });
const form = (over = {}) => ({ enrollmentId: ANN, role: 'AI Solutions Analyst', basis: 'yearly', salary: '105000', rate: '', hours: '40', startDate: '2027-01-04', respondBy: '2026-11-27', agreed: true, followUp: true, ...over });

describe('sign-in and session', () => {
  test('the link token is a uuid only', () => {
    assert.equal(M.tokenFromQuery(`?t=${TOKEN}`), TOKEN);
    for (const q of ['', '?t=', '?t=abc', `?t=${TOKEN}x`, '?t=%E0%A4%A', `?x=${TOKEN}`]) assert.equal(M.tokenFromQuery(q), null, q);
  });
  test('a session lasts until a minute before it ends; a damaged or expired one is no session', () => {
    const s = M.makeSession({ token: 'jwt', expiresIn: 3600, clientName: 'Acme' }, 1000);
    assert.deepEqual(s, { token: 'jwt', until: 1000 + 3600000 - 60000, clientName: 'Acme' });
    assert.deepEqual(M.readSession(JSON.stringify(s), 2000), s);
    for (const raw of [null, '', '{', 'null', '{"token":"","until":9e15}', JSON.stringify(s).replace('jwt', '')]) assert.equal(M.readSession(raw, 2000), null, String(raw));
    assert.equal(M.readSession(JSON.stringify(s), s.until), null);
  });
  test('a data answer: 200 ok, 401 signed out, anything else a plain failure (a 5xx body is never shown)', () => {
    assert.equal(M.dataState(200, { a: 1 }).kind, 'ok');
    assert.equal(M.dataState(401, {}).kind, 'signed_out');
    assert.equal(M.dataState(500, { error: 'stack trace' }).message, M.TEXT.failed);
    assert.equal(M.dataState(0, null).message, M.TEXT.failed);
    assert.equal(M.dataState(400, { error: 'This takes no query parameters.' }).message, 'This takes no query parameters.');
  });
});

describe('the live fee estimate (the server formula, feeCalculator.computeFee)', () => {
  test('yearly $105,000 at 110%: $105,000 and $115,500', () => {
    const e = M.estimate(form(), 11000);
    assert.equal(M.money(e.firstYearCents), '$105,000');
    assert.equal(M.money(e.feeCents), '$115,500');
  });
  test('hourly $50 x 40 x 52: $104,000 and $114,400; the rate the server gives is used', () => {
    const e = M.estimate(form({ basis: 'hourly', rate: '50', hours: '40' }), 11000);
    assert.equal(M.money(e.firstYearCents), '$104,000');
    assert.equal(M.money(e.feeCents), '$114,400');
    assert.equal(M.money(M.estimate(form(), 12500).feeCents), '$131,250');
    assert.equal(M.pct(11000), '110%');
    assert.equal(M.pct(12550), '125.5%');
  });
  test('half-up on the fee cent; hours in tenths; cents typed', () => {
    assert.equal(M.estimate(form({ salary: '1.05' }), 11000).feeCents, 116); // 115.5 cents -> 116
    assert.equal(M.estimate(form({ basis: 'hourly', rate: '33.33', hours: '37.5' }), 11000).firstYearCents, Math.round(3333 * 375 * 52 / 10));
    assert.equal(M.cents('105,000'), 10500000);
    assert.equal(M.cents('$52.5'), 5250);
    for (const bad of ['', 'abc', '1e5', '-5', '5.555', '1.2.3']) assert.equal(M.cents(bad), null, bad);
  });
  test('the server\'s limits, in its words: at least $1, at most $2,000,000 or $1,000 an hour, 1 to 80 hours, one decimal', () => {
    assert.equal(M.estimate(form({ salary: '0.99' }), 11000).problem, 'The yearly salary must be at least $1.');
    assert.equal(M.estimate(form({ salary: '2000000.01' }), 11000).problem, 'The yearly salary can be at most $2,000,000.');
    assert.equal(M.estimate(form({ basis: 'hourly', rate: '1000.01' }), 11000).problem, 'The hourly rate can be at most $1,000.');
    assert.equal(M.estimate(form({ basis: 'hourly', rate: '50', hours: '81' }), 11000).problem, 'Hours a week must be 1 to 80.');
    assert.equal(M.estimate(form({ basis: 'hourly', rate: '50', hours: '0' }), 11000).problem, 'Hours a week must be 1 to 80.');
    assert.equal(M.estimate(form({ basis: 'hourly', rate: '50', hours: '40.25' }), 11000).problem, 'Hours a week can have at most one decimal place.');
    assert.equal(M.estimate(form({ salary: '2000000' }), 11000).ok, true);
    assert.equal(M.DEFAULT_HOURS, 40);
  });
});

describe('Send and the request', () => {
  test('Send stays disabled until the agreement box is ticked, and while a Send is in flight', () => {
    assert.deepEqual(M.sendState(form({ agreed: false }), 11000, false), { can: false, why: 'Tick the box to agree to the placement fee before sending.' });
    assert.equal(M.sendState(form(), 11000, false).can, true);
    assert.equal(M.sendState(form(), 11000, true).can, false);
    assert.equal(M.sendState(form({ role: '  ' }), 11000, false).can, false);
    assert.equal(M.sendState(form({ role: 'x'.repeat(201) }), 11000, false).can, false);
    assert.equal(M.sendState(form({ enrollmentId: 'nope' }), 11000, false).can, false);
    assert.deepEqual(M.sendState(form({ salary: '' }), 11000, false), { can: false, why: 'Enter the pay to see the fee.' });
    assert.equal(M.payBlank(form({ basis: 'hourly', rate: ' ' })), true);
    assert.equal(M.payBlank(form({ basis: 'hourly', rate: '50', salary: '' })), false);
    assert.deepEqual(M.sendState(form({ salary: 'abc' }), 11000, false), { can: false, why: 'The yearly salary must be at least $1.' });
  });
  test('the body matches MakeOfferBody: no fee from the page, the agreement version, 5:00 PM Central respond-by', () => {
    const b = M.offerBody(form({ basis: 'hourly', rate: '50', hours: '40' }), 'k-1');
    assert.deepEqual(Object.keys(b).sort(), ['agreed', 'agreementTextVersion', 'clientKey', 'enrollmentId', 'pay', 'respondBy', 'role', 'startDate']);
    assert.deepEqual(b.pay, { basis: 'hourly', rateCents: 5000, hoursPerWeek: 40 });
    assert.equal(b.respondBy, '2026-11-27T23:00:00.000Z'); // CST
    assert.equal(b.agreementTextVersion, M.AGREEMENT_VERSION);
    const keys = []; JSON.stringify(b, (k, v) => { keys.push(k); return v; });
    assert.ok(!keys.some((k) => /fee|rate_?bp|firstYear/i.test(k)), keys.join(','));
    assert.equal(M.offerBody(form({ startDate: 'soon', respondBy: '' }), 'k').startDate, null);
    assert.equal(M.offerBody(form({ respondBy: '' }), 'k').respondBy, null);
  });
  test('respond-by across daylight saving: 5:00 PM Central is 22:00Z in summer and 23:00Z in winter', () => {
    assert.equal(M.centralFivePm('2027-07-01'), '2027-07-01T22:00:00.000Z');
    assert.equal(M.centralFivePm('2026-11-01'), '2026-11-01T23:00:00.000Z'); // the day DST ends
    assert.equal(M.centralFivePm('2027-03-14'), '2027-03-14T22:00:00.000Z'); // the day DST starts
    assert.equal(M.centralFivePm('2026-12-31'), '2026-12-31T23:00:00.000Z');
  });
  test('an offer answer: 201 sent, 200 the same Send again, 400 the reason, 401 signed out', () => {
    assert.equal(M.offerState(201, { offer: {}, replay: false }).message, M.TEXT.sent);
    assert.equal(M.offerState(200, { offer: {}, replay: true }).message, M.TEXT.replay);
    assert.deepEqual(M.offerState(400, { error: 'Enter the role title.' }), { kind: 'fix', message: 'Enter the role title.' });
    assert.equal(M.offerState(401, {}).kind, 'signed_out');
    assert.equal(M.offerState(500, { error: 'boom' }).message, M.TEXT.failed);
  });
});

describe('the cards', () => {
  const ctx = (over = {}) => ({ interviews: [], offers: [], profilesUnavailable: false, ...over });
  test('readiness, verified projects, the resume link; absent facts in words, never a number', () => {
    const k = V.card(cand(), ctx());
    assert.equal(k.readiness.value, '72');
    assert.equal(k.projects, 'Freight ETA, Dock planner, Claims triage and 2 more');
    assert.equal(k.resume, PROFILE.url);
    assert.equal(k.role, 'AI Solutions Analyst');
    assert.deepEqual(k.status, { text: 'Put forward', tone: 'p-info' });
    const none = V.card(cand({ readiness: null, profile: null }), ctx());
    assert.deepEqual(none.readiness, { value: null, text: 'Readiness not yet assessed' });
    assert.equal(none.projects, 'None verified yet');
    assert.equal(none.resume, null);
    assert.equal(none.role, 'Role not set yet');
    assert.equal(V.card(cand({ profile: null }), ctx({ profilesUnavailable: true })).projects, 'Could not load just now');
  });
  test('a profile link that is not our https /talent/ shape is never used', () => {
    for (const url of ['javascript:alert(1)//talent/x/', 'http://hire.refactored.ai/talent/a/', 'https://x/talent/a"onmouseover="x/', 'https://x/talent/a/b/']) {
      assert.equal(V.card(cand({ profile: { ...PROFILE, url } }), ctx()).resume, null, url);
    }
  });
  test('status and role come from this client\'s own offers, then interviews', () => {
    const iv = { id: 'i1', enrollmentId: ANN, status: 'booked', role: 'Analyst' };
    assert.equal(V.card(cand(), ctx({ interviews: [iv] })).status.text, 'Interview booked');
    assert.equal(V.card(cand(), ctx({ interviews: [iv] })).role, 'Analyst');
    const k = V.card(cand(), ctx({ interviews: [iv], offers: [offer({ status: 'accepted' })] }));
    assert.deepEqual([k.status.text, k.role], ['Accepted', 'Data Lead']);
    assert.equal(V.card(cand({ enrollmentId: BOB }), ctx({ offers: [offer()] })).status.text, 'Put forward');
  });
});

describe('the tables and KPIs', () => {
  test('Offers and fees: 3 KPIs (out, accepted, fees on accepted), 7 columns, the callout with the rate', () => {
    const offers = [offer(), offer({ id: 'o2', status: 'accepted', feeCents: 11440000, invoiceStatus: 'not_invoiced' }), offer({ id: 'o3', status: 'talk_first' })];
    assert.deepEqual(V.kpis(offers), { out: 2, accepted: 1, fees: '$114,400' });
    const r = V.offerRow(offer({ payBasis: 'hourly', hourlyRateCents: 5000, hoursPerWeek: 40, salaryCents: null }));
    assert.equal(r.basis, '$50/hr × 40 h × 52 wk');
    assert.deepEqual([r.firstYear, r.fee, r.start, r.status.text, r.invoice], ['$105,000', '$115,500', 'Mon, Jan 4, 2027', 'Offer out', 'Fee applies on acceptance']);
    assert.equal(V.offerRow(offer({ status: 'accepted', invoiceStatus: 'paid' })).invoice, 'Paid');
    assert.match(V.feeCallout(11000), /110% of the first-year salary/);
  });
  test('Interviews: Join only for our signed room page; times in Central', () => {
    const room = `https://hire.refactored.ai/room/?i=${ANN}&e=1795447800000&t=${'S'.repeat(43)}`;
    const r = V.interviewRow({ id: 'i', candidateName: 'Ann', status: 'booked', startsAt: '2026-11-23T15:00:00.000Z', minutes: 30, role: 'Analyst', joinPage: room, recorded: true });
    assert.deepEqual([r.when, r.join, r.status.text], ['Mon, Nov 23, 9:00 AM Central', room, 'Interview booked · recorded']);
    assert.equal(V.interviewRow({ status: 'booked', joinPage: 'https://zoom.example/j/SECRET' }).join, null);
    assert.equal(V.interviewRow({ status: 'not_booked', startsAt: null }).when, 'Not booked');
  });
});

describe('the page', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
  const html = read('client/index.html');
  const js = ['assets/client-portal.js', 'assets/client-offer.js'].map(read).join('\n');
  test('noindex, no referrer, scripts in order, the API base from the build', () => {
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
    assert.match(html, /data-api="\{\{brand\.platformApiBase\}\}"/);
    const order = ['common.js', 'client-model.js', 'client-views.js', 'client-portal.js', 'client-offer.js'].map((f) => html.indexOf(`/assets/${f}`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((i) => i > 0));
  });
  test('the sign-in token leaves the address bar at once; the session lives in sessionStorage only, never localStorage', () => {
    assert.match(js, /history\.replaceState\(null, '', window\.location\.pathname\)/);
    assert.match(js, /sessionStorage/);
    assert.doesNotMatch(js, /localStorage|document\.cookie/);
  });
  test('every interpolated value goes through esc(); links open with noopener noreferrer', () => {
    assert.doesNotMatch(js, /innerHTML = [^;]*\+ (?!esc\()(?:k|r|c|f|d|S)\.[a-zA-Z]+ \+/);
    for (const m of js.match(/target="_blank"[^>]*/g)) assert.match(m, /rel="noopener noreferrer"/);
  });
  test('no copy says "free" or uses an en or em dash', () => {
    const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');
    for (const s of [html, js, read('assets/client-model.js'), read('assets/client-views.js'), read('assets/client.css')]) assert.doesNotMatch(s, DASH_OR_FREE);
  });
});
