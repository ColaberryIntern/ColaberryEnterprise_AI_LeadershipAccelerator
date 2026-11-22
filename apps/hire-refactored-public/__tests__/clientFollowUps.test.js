/**
 * The employer portal's follow-ups (Career Prep CP10.3, kit F8), from client-followup-model.js: the templates, the
 * checks shown before saving (the server's words), the request body with the Central send time, the offer reminder,
 * and what each Follow-ups row says. client-followups.js and client-portal.js only render these.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/assets/client-followup-model.js');

const ANN = '11111111-0000-4000-8000-000000000001';
const KEY = '99999999-0000-4000-8000-000000000009';
const EM = String.fromCharCode(0x2014);
const form = (over = {}) => ({ ...F.draft(ANN, 'thank_you', 'Meridian Freight', '2026-11-01'), ...over });
const fu = (over = {}) => ({ id: 'f1', enrollmentId: ANN, candidateName: 'Ann Lee', subject: 'Next steps', template: 'next_steps', sendOn: '2026-11-25T15:00:00.000Z',
  onlyIf: 'no_reply', status: 'scheduled', reason: null, retrying: false, sentAt: null, opens: 0, clicks: { link: 0, other: 0 }, ...over });

describe('templates', () => {
  test('four, in the design order, each signed with the company; Custom is empty', () => {
    assert.deepEqual(F.ORDER.map((k) => F.TEMPLATES[k].label), ['Thank you', 'Next steps', 'Offer reminder', 'Custom']);
    const d = F.draft(ANN, 'offer_reminder', 'Meridian Freight', '2026-11-25');
    assert.equal(d.subject, 'Checking in on our offer');
    assert.match(d.body, /^Hi \{first\},\n\n.*\n\nMeridian Freight$/s);
    assert.equal(F.draft(ANN, 'custom', 'X').body, '');
    assert.deepEqual([d.time, d.onlyIf], ['09:00', 'no_reply']);
  });
  test('switching template replaces subject and message; Custom keeps what was typed', () => {
    const f = F.applyTemplate(form({ body: 'mine' }), 'next_steps', 'Co');
    assert.equal(f.subject, 'Next steps'); assert.match(f.body, /\{booking link\}/);
    assert.equal(F.applyTemplate(form({ body: 'mine' }), 'custom', 'Co').body, 'mine');
  });
  test('no template text has a long dash or the word free', () => {
    for (const t of Object.values(F.TEMPLATES)) assert.doesNotMatch(t.subject + t.body, new RegExp('[\\u2013\\u2014]|\\bfree\\b', 'i'));
  });
});

describe('the checks before saving (the server says the same)', () => {
  test('a long dash in the message or subject is refused with the clear message', () => {
    assert.equal(F.problem(form({ body: `Hi ${EM} there` })), F.TEXT.dashBody);
    assert.equal(F.problem(form({ subject: `A ${EM} B` })), F.TEXT.dashSubject);
  });
  test('one link at most, counting {booking link}; {booking link} needs an https link', () => {
    assert.equal(F.problem(form({ body: 'https://a.example https://b.example' })), F.TEXT.oneLink);
    assert.equal(F.problem(form({ body: 'Pick: {booking link}' })), F.TEXT.needLink);
    assert.equal(F.problem(form({ body: 'Pick: {booking link}', bookingLink: 'http://cal.example' })), F.TEXT.badLink);
    assert.equal(F.problem(form({ body: 'Pick: {booking link}', bookingLink: `https://cal.example/a${EM}b` })), F.TEXT.badLink);
    assert.equal(F.problem(form({ body: 'Pick: {booking link}', bookingLink: 'https://cal.example/dana' })), '');
    assert.equal(F.problem(form({ bookingLink: 'https://cal.example/dana' })), F.TEXT.unusedLink);
    assert.equal(F.problem(form({ body: 'Hi {name}' })), 'Only {first} and {booking link} can be filled in for you. Remove {name}.');
  });
  test('Schedule it needs a day and time; Send now does not', () => {
    assert.equal(F.problem(form({ date: '' })), F.TEXT.when);
    assert.equal(F.problem(form({ date: '' }), true), '');
    assert.equal(F.problem(form({ subject: ' ' })), F.TEXT.subjectBlank);
  });
});

describe('the request', () => {
  test('DST: 2026-11-01 09:00 Central is sent as 15:00Z; the key is the id; no fee, no attachments', () => {
    const b = F.requestBody(form(), KEY, false);
    assert.equal(b.sendOn, '2026-11-01T15:00:00.000Z');
    assert.equal(b.id, KEY);
    assert.equal(b.sendNow, undefined);
    assert.deepEqual(Object.keys(b).sort(), ['body', 'bookingLink', 'enrollmentId', 'id', 'offerId', 'onlyIf', 'sendOn', 'subject', 'template']);
  });
  test('Send now sends no time', () => {
    const b = F.requestBody(form(), KEY, true);
    assert.equal(b.sendNow, true); assert.equal(b.sendOn, undefined);
  });
  test('the offer reminder: 9:00 AM Central three Central days on, only if no reply, tied to the offer', () => {
    const f = F.offerReminder({ id: 'o1', enrollmentId: ANN }, 'Co', Date.parse('2026-11-23T04:30:00Z')); // still Nov 22 in Central
    assert.deepEqual([f.date, f.time, f.onlyIf, f.offerId, f.template], ['2026-11-25', '09:00', 'no_reply', 'o1', 'offer_reminder']);
    assert.equal(F.requestBody(f, KEY, false).sendOn, '2026-11-25T15:00:00.000Z');
  });
  test('answers: saved (with the held warning when email is off), 400 the reason, 401, 404, else a plain failure', () => {
    const s = F.saveState(201, { followUp: fu(), replay: false, mailOn: false }, true);
    assert.equal(s.kind, 'saved');
    assert.match(s.message, /^Follow-up to Ann Lee scheduled for .* Central\. It is skipped if they reply first\. Employer email is switched off/);
    // On the Follow-ups page the banner says it once; the notice does not repeat it.
    assert.doesNotMatch(F.saveState(201, { followUp: fu(), replay: false, mailOn: false }).message, /switched off/);
    assert.deepEqual([F.saveState(400, { error: F.TEXT.dashBody }).message, F.saveState(401, {}).kind, F.saveState(404, {}).kind, F.saveState(500, { error: 'stack' }).kind],
      [F.TEXT.dashBody, 'signed_out', 'fix', 'failed']);
  });
});

describe('the Follow-ups rows', () => {
  test('scheduled: the send time and Cancel; sent: when it went, opens and clicks', () => {
    assert.deepEqual([F.row(fu()).status.text, F.row(fu()).canCancel], ['Scheduled', true]);
    const r = F.row(fu({ status: 'clicked', sentAt: '2026-11-25T15:01:00.000Z', opens: 0, clicks: { link: 1, other: 0 } }));
    assert.deepEqual([r.status.text, r.tracking, r.canCancel], ['Clicked', 'Clicked the link 1. Opens cannot be tracked for plain-text email.', false]);
    assert.match(r.when, /^Sent /);
  });
  test('a sent row never shows an open count it cannot measure (no "Opened 0")', () => {
    const r = F.row(fu({ status: 'sent', sentAt: '2026-11-25T15:01:00.000Z', opens: 0 }));
    assert.equal(r.tracking, 'No clicks yet. Opens cannot be tracked for plain-text email.');
    assert.doesNotMatch(r.tracking, /Opened \d/);
    assert.doesNotMatch(F.TEXT.checks, /opens show/i);
  });
  test('there is no "Opened" status pill (opens are never tracked, so no row can be in that state)', () => {
    for (const s of ['scheduled', 'sending', 'sent', 'clicked', 'replied', 'cancelled', 'failed', 'held']) {
      assert.doesNotMatch(F.row(fu({ status: s, sentAt: '2026-11-25T15:01:00.000Z' })).status.text, /open/i, s);
    }
    assert.notEqual(F.row(fu({ status: 'opened', sentAt: '2026-11-25T15:01:00.000Z' })).status.text, 'Opened');
  });
  test('a link typed into the message must be https://', () => {
    assert.equal(F.problem(form({ body: 'See http://a.example/x' })), F.TEXT.httpsOnly);
    assert.equal(F.problem(form({ body: 'See www.a.example' })), F.TEXT.httpsOnly);
    assert.equal(F.problem(form({ body: 'See https://a.example/x' })), '');
  });
  test('held, cancelled and not sent say why, honestly', () => {
    assert.equal(F.row(fu({ status: 'held', reason: 'employer_mail_off' })).tracking, 'Held: employer email is switched off, so it was not sent.');
    assert.equal(F.row(fu({ status: 'cancelled', reason: 'replied' })).tracking, 'Cancelled: they replied before it went.');
    assert.equal(F.row(fu({ status: 'failed', reason: 'SendBlocked' })).tracking, 'Not sent after 4 tries.');
    assert.equal(F.row(fu({ retrying: true })).tracking, 'Trying again after a delivery problem.');
    assert.equal(F.row(fu({ status: 'replied', sentAt: '2026-11-25T15:01:00.000Z' })).status.text, 'Replied');
  });
});
