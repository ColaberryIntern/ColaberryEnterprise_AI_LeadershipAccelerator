/**
 * The booking page's rules (Career Prep CP8.2, kit F4 step 3), from booking-model.js: the link, what each API answer
 * means, the day groups, the interviewers, and the page shell (noindex, scripts, no provider link). booking.js only
 * renders these.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../src/assets/booking-model.js');

const T = 'Q'.repeat(43);
const VIEW = { candidate: 'Ann', company: 'Acme', position: 'Data Analyst', minutes: 30, recordingNotice: 'recorded only if everyone agrees', timezone: 'America/Chicago', reason: null,
  slots: [{ startsAt: '2026-11-23T15:00:00.000Z', central: 'Mon, Nov 23, 9:00 AM CST', local: 'Mon, Nov 23, 10:00 AM EST' },
    { startsAt: '2026-11-23T15:30:00.000Z', central: 'Mon, Nov 23, 9:30 AM CST', local: 'Mon, Nov 23, 10:30 AM EST' },
    { startsAt: '2026-11-24T15:00:00.000Z', central: 'Tue, Nov 24, 9:00 AM CST', local: null }] };

describe('the link', () => {
  test('only the 43-character token we send is read; anything else is no token', () => {
    assert.equal(M.tokenFromQuery(`?t=${T}`), T);
    assert.equal(M.tokenFromQuery(`?x=1&t=${T}#top`), T);
    for (const q of ['', '?t=', `?t=${T}x`, '?t=short', `?t=${'Q'.repeat(42)}!`, `?tt=${T}`]) assert.equal(M.tokenFromQuery(q), null, q);
  });
});

describe('what the page-data answer means', () => {
  test('ready with times; empty; arranging; used/expired/closed with the API reason; invalid; busy; failed', () => {
    assert.deepEqual(M.viewState(200, { booking: VIEW }), { kind: 'ready' });
    assert.equal(M.viewState(200, { booking: { ...VIEW, slots: [] } }).kind, 'empty');
    assert.equal(M.viewState(200, { booking: { ...VIEW, slots: [], reason: 'arranging' } }).kind, 'arranging');
    assert.deepEqual(M.viewState(410, { error: 'This booking link was already used to book a time.', reason: 'used' }),
      { kind: 'gone', reason: 'used', message: 'This booking link was already used to book a time.' });
    assert.equal(M.viewState(404, { error: 'x' }).kind, 'invalid');
    assert.equal(M.viewState(429, null).kind, 'busy');
    for (const s of [0, 500, 503]) assert.equal(M.viewState(s, null).kind, 'failed');
    assert.equal(M.viewState(200, null).kind, 'failed'); // a 200 without the expected shape is not a page
  });
});

describe('what the confirm answer means', () => {
  test('booked; taken (409) vs arranging (409); gone; invalid; fix (400); busy; failed', () => {
    const booked = { startsAt: VIEW.slots[0].startsAt, minutes: 30, roomPage: 'https://hire.refactored.ai/room/?i=a&e=1&t=b' };
    assert.deepEqual(M.confirmState(200, { booked, replay: false }), { kind: 'booked', booked });
    assert.equal(M.confirmState(409, { reason: 'taken' }).kind, 'taken');
    assert.equal(M.confirmState(409, { reason: 'arranging' }).kind, 'arranging');
    assert.equal(M.confirmState(410, { reason: 'used', error: 'used' }).kind, 'gone');
    assert.equal(M.confirmState(404, {}).kind, 'invalid');
    assert.equal(M.confirmState(400, { error: 'Pick a time.' }).message, 'Pick a time.');
    assert.equal(M.confirmState(429, null).kind, 'busy');
    assert.equal(M.confirmState(0, null).kind, 'failed');
  });
});

describe('the page content', () => {
  test('heading by first name only, role line, and a plain fallback', () => {
    assert.equal(M.heading(VIEW), 'Book your interview with Ann');
    assert.equal(M.heading({ candidate: 'the candidate' }), 'Book your interview with the candidate');
    assert.equal(M.roleLine(VIEW), 'Data Analyst at Acme, 30 minutes');
    assert.equal(M.roleLine({ minutes: 0 }), 'length to be confirmed');
  });
  test('times grouped by Central day, in order, each with its own local time', () => {
    assert.deepEqual(M.groupSlots(VIEW.slots).map((g) => [g.day, g.slots.map((s) => [s.time, s.local && s.local.time])]), [
      ['Mon, Nov 23', [['9:00 AM CST', '10:00 AM EST'], ['9:30 AM CST', '10:30 AM EST']]],
      ['Tue, Nov 24', [['9:00 AM CST', null]]],
    ]);
    assert.deepEqual(M.groupSlots(null), []);
    assert.deepEqual(M.groupSlots([null, { startsAt: 'x' }]), []);
  });
  test('interviewers: optional, lowercased, de-duplicated, at most 5, a bad one named', () => {
    assert.deepEqual(M.parseInterviewers(''), { emails: [], error: null });
    assert.deepEqual(M.parseInterviewers(' Pat@Acme.example, kim@acme.example;pat@acme.example '), { emails: ['pat@acme.example', 'kim@acme.example'], error: null });
    assert.match(M.parseInterviewers('pat@acme.example nope').error, /"nope" is not an email address/);
    assert.match(M.parseInterviewers('a@x.io b@x.io c@x.io d@x.io e@x.io f@x.io').error, /at most 5/);
  });
  test('findSlot answers only a time still on offer', () => {
    assert.equal(M.findSlot(VIEW.slots, VIEW.slots[1].startsAt), VIEW.slots[1]);
    assert.equal(M.findSlot(VIEW.slots, '2026-01-01T00:00:00.000Z'), null);
  });
});

describe('the page shell', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'book', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'booking.js'), 'utf8');
  test('noindex and no referrer (the token must never leak), the model before the page script', () => {
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
    assert.ok(html.indexOf('booking-model.js') < html.indexOf('/assets/booking.js'));
    assert.ok(!/track-v2\.js/.test(html), 'no tracking script on a private link page');
  });
  test('the confirm is guarded against a double click, and no copy says "free" or uses an en or em dash', () => {
    assert.match(js, /if \(S\.busy \|\| !S\.slot\) return;/);
    const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');
    for (const s of [html, js, JSON.stringify(M.TEXT)]) assert.doesNotMatch(s, DASH_OR_FREE);
  });
});
