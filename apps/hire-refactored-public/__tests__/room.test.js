/**
 * The employer interview room's rules (Career Prep CP9.1, kit F5; execution contract E3), from room-model.js: the
 * signed link, what each API answer means, the consent copy, the way in, and the notes. room.js only renders these.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../src/assets/room-model.js');

const ID = '11111111-1111-4111-8111-111111111111';
const T = 'S'.repeat(43);
const ROOM = { interviewId: ID, you: 'employer', company: 'Acme', role: 'Data Analyst', startsAt: '2026-11-23T15:00:00.000Z', endsAt: '2026-11-23T15:30:00.000Z',
  opensAt: '2026-11-23T14:50:00.000Z', yourDecision: null, consent: { consented: 0, of: 2, declined: false, label: 'RECORDING 0 OF 2 CONSENTED' },
  recording: { status: 'off', note: null }, join: { status: 'decide_first', url: null, reason: 'Choose first.' } };

describe('the link', () => {
  test('only an interview id, an end time and a 43-character signature of the shapes we send', () => {
    assert.deepEqual(M.linkFromQuery(`?i=${ID}&e=1795447800000&t=${T}`), { i: ID, e: '1795447800000', t: T });
    for (const q of ['', `?i=${ID}&e=1&t=short`, `?i=nope&e=1&t=${T}`, `?i=${ID}&e=x&t=${T}`, `?i=${ID}&t=${T}`]) assert.equal(M.linkFromQuery(q), null, q);
    assert.equal(M.linkQuery({ i: ID, e: '5', t: T }), `?e=5&t=${T}`);
  });
});

describe('the consent copy (E3)', () => {
  test('names recording AND AI scoring of the candidate\'s voice and words, from the audio only', () => {
    assert.match(M.CONSENT.yes, /recorded/);
    assert.match(M.CONSENT.yes, /AI scores the candidate's voice and words/);
    assert.match(M.CONSENT.yes, /scores the audio only; it never analyzes the video/);
    assert.match(M.CONSENT.yes, /Only the candidate's answers are scored/);
  });
  test('says plainly that any no means: still goes ahead, unrecorded, unscored, no replay', () => {
    assert.match(M.CONSENT.no, /If anyone says no, the interview still goes ahead/);
    assert.match(M.CONSENT.no, /not recorded, nothing is scored, and the candidate gets no replay/);
    assert.match(M.mine({ yourDecision: 'decline' }), /unrecorded, with no replay/);
  });
  test('"No" has the same weight as "Yes": one button class for both, rendered side by side, both disabled together', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'room.js'), 'utf8');
    const buttons = js.match(/<button type="button" class="[^"]+" data-decide="(consent|decline)"/g) || [];
    assert.equal(buttons.length, 2);
    assert.equal(new Set(buttons.map((b) => /class="([^"]+)"/.exec(b)[1])).size, 1);
    for (const d of ['consent', 'decline']) assert.ok(js.includes(`data-decide="${d}"' + (S.busy ? ' disabled' : '') + '>' + esc(k.${d}) + '</button>`), `${d}: the same busy rule`);
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'room.css'), 'utf8');
    assert.match(css, /\.iroom \.choices\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.ok(!/\.choice\[data-decide/.test(css), 'no style may single one choice out');
  });
});

describe('what each answer means', () => {
  test('room: ok; 401 invalid vs expired; 403 not open (opensAt); 410 gone; 409 not ready; 429 busy; anything else failed', () => {
    assert.equal(M.roomState(200, { room: ROOM }).kind, 'ok');
    assert.equal(M.roomState(200, {}).kind, 'failed');
    assert.equal(M.roomState(401, { reason: 'expired' }).message, M.TEXT.expired);
    assert.equal(M.roomState(401, { reason: 'invalid' }).message, M.TEXT.invalid);
    assert.deepEqual(M.roomState(403, { opensAt: ROOM.opensAt }), { kind: 'not_open', opensAt: ROOM.opensAt });
    assert.deepEqual(M.roomState(410, { reason: 'moved', error: 'Moved.' }), { kind: 'gone', reason: 'moved', message: 'Moved.' });
    assert.equal(M.roomState(409, {}).kind, 'not_ready');
    assert.equal(M.roomState(429, null).kind, 'busy');
    for (const s of [0, 500, 404]) assert.equal(M.roomState(s, null).kind, 'failed');
  });
  test('guide: the questions; none on file; could not be read (null); invalid; gone; failed', () => {
    assert.deepEqual(M.guideState(200, { guide: { questions: ['Q1'], notes: [] } }), { kind: 'ok', questions: ['Q1'], questionsNote: '', notes: [] });
    assert.equal(M.guideState(200, { guide: { questions: [], notes: [] } }).questionsNote, M.TEXT.noQuestions);
    assert.equal(M.guideState(200, { guide: { questions: null, notes: [] } }).questionsNote, M.TEXT.questionsFailed);
    assert.equal(M.guideState(401, { reason: 'expired' }).kind, 'invalid');
    assert.equal(M.guideState(410, {}).kind, 'gone');
    assert.equal(M.guideState(200, {}).kind, 'failed');
  });
  test('the way in: decide first; ready only with an https meeting link; starting; withheld with its reason', () => {
    assert.deepEqual(M.joinView(ROOM), { kind: 'decide' });
    assert.deepEqual(M.joinView({ ...ROOM, yourDecision: 'consent', join: { status: 'ready', url: 'https://zoom.example/j/1', reason: null } }), { kind: 'ready', url: 'https://zoom.example/j/1' });
    assert.equal(M.joinView({ ...ROOM, yourDecision: 'consent', join: { status: 'ready', url: 'javascript:alert(1)', reason: null } }).kind, 'withheld');
    assert.equal(M.joinView({ ...ROOM, yourDecision: 'consent', join: { status: 'starting', url: null, reason: 'Turning it on.' } }).kind, 'starting');
    assert.deepEqual(M.joinView({ ...ROOM, yourDecision: 'decline', join: { status: 'withheld', url: null, reason: 'Checking.' } }), { kind: 'withheld', message: 'Checking.' });
  });
});

describe('notes', () => {
  test('a draft is trimmed; empty and over 2000 characters are named', () => {
    assert.deepEqual(M.checkNote('  Good answer.  '), { body: 'Good answer.', error: null });
    assert.equal(M.checkNote('   ').error, M.TEXT.noteEmpty);
    assert.equal(M.checkNote('x'.repeat(M.MAX_NOTE + 1)).error, M.TEXT.noteLong);
    assert.equal(M.checkNote('x'.repeat(M.MAX_NOTE)).error, null);
  });
  test('saved (201) and the same Save again (200) both show the guide; full; fix; invalid; failed keeps the text', () => {
    const ok = { note: { id: '1', body: 'x', at: ROOM.startsAt }, replay: false, guide: { questions: [], notes: [{ id: '1', body: 'x', at: ROOM.startsAt }] } };
    assert.equal(M.noteState(201, ok).kind, 'saved');
    assert.equal(M.noteState(200, { ...ok, replay: true }).guide.notes.length, 1);
    assert.equal(M.noteState(409, { reason: 'full' }).kind, 'full');
    assert.equal(M.noteState(400, { error: 'Bad.' }).message, 'Bad.');
    assert.equal(M.noteState(401, { reason: 'expired' }).message, M.TEXT.expired);
    assert.equal(M.noteState(0, null).message, M.TEXT.noteFailed);
  });
});

describe('time', () => {
  test('Central, whatever the viewer zone; the open wait only within 6 hours', () => {
    assert.equal(M.central('2026-11-23T15:00:00.000Z'), 'Mon, Nov 23, 9:00 AM');
    assert.equal(M.central('nope'), '');
    const now = Date.parse('2026-11-23T14:40:00.000Z');
    assert.equal(M.openWait(ROOM.opensAt, now), 10 * 60_000 + 500);
    assert.equal(M.openWait(ROOM.opensAt, now + 3_600_000), null);
    assert.equal(M.openWait('2026-11-24T14:50:00.000Z', now), null);
  });
});

describe('the page shell', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'room', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'room.js'), 'utf8');
  test('noindex and no referrer (the signature must never leak), the model before the page script, no tracking', () => {
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
    assert.ok(html.indexOf('room-model.js') < html.indexOf('/assets/room.js'));
    assert.ok(!/track-v2\.js/.test(html));
  });
  test('a decision and a Save are each sent once (guards), the meeting opens in a new tab with no referrer', () => {
    assert.match(js, /function decide\(d\) \{\n\s+if \(S\.busy\) return;/);
    assert.match(js, /function saveNote\(\) \{\n\s+if \(S\.saving\) return;/);
    assert.match(js, /target="_blank" rel="noopener noreferrer">Open the meeting/);
  });
  test('the starting poll is bounded', () => {
    assert.match(js, /S\.polls < M\.MAX_POLLS/);
    assert.equal(M.MAX_POLLS, 10);
  });
  test('no copy says "free" or uses an en or em dash', () => {
    const DASH_OR_FREE = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\bfree\\b`, 'i');
    for (const s of [html, js, JSON.stringify(M.CONSENT), JSON.stringify(M.TEXT)]) assert.doesNotMatch(s, DASH_OR_FREE);
  });
});
