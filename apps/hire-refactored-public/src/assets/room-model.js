/*
 * hire.refactored.ai - the employer interview room's pure logic (/room/?i=<interview>&e=<end ms>&t=<signature>,
 * Career Prep CP9.1, kit F5). No DOM: what the link carries, what each API answer means for the page, the consent
 * copy, the join state, and the notes' rules. room.js renders it; node's runner tests it.
 *
 * The API (backend routes/placementRoomRoutes.ts and placementRoomGuideRoutes.ts) is reached ONLY with the signed link
 * from the booking email. The meeting provider's link (room.join.url) is given only after the employer's own
 * recording decision, when the server says the room is ready; the guide and notes answers never carry it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireRoomModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var MAX_NOTE = 2000;
  var POLL_MS = 3000;
  var MAX_POLLS = 10;

  /*
   * E3 (execution contract): name recording AND AI scoring of the candidate's voice and words (the audio only, never the video); "No" has
   * the same weight as "Yes" (room.js renders both with one class); say plainly what any "no" means.
   */
  var CONSENT = {
    heading: 'Can this interview be recorded?',
    yes: 'If everyone agrees, the meeting (video and audio) is recorded, and AI scores the candidate\'s voice and words: what they say, their pace and their pauses. Only the candidate\'s answers are scored, to give them feedback. The AI scores the audio only; it never analyzes the video.',
    no: 'If anyone says no, the interview still goes ahead. It is not recorded, nothing is scored, and the candidate gets no replay.',
    once: 'Your side chooses once for this interview, for everyone on this link. Either choice is fine. Your private notes are never shown to the candidate.',
    consent: 'Yes, record it',
    decline: 'No, do not record it',
  };

  var TEXT = {
    invalid: 'This room link is not valid. Check that the whole link was copied from the booking email.',
    expired: 'This room link has expired. Links stop working 2 hours after the interview ends.',
    failed: 'We could not reach the interview room. Check your connection and try again.',
    busy: 'Too many tries from here just now. Please wait a few minutes and try again.',
    notReady: 'The meeting is still being set up. Try again in a minute.',
    stalled: 'The recording is taking longer than usual to set up.',
    noQuestions: 'No questions are on file for this role yet.',
    questionsFailed: 'The questions for this role could not be loaded. Your notes still work.',
    noteEmpty: 'Write a note first.',
    noteLong: 'A note can be at most ' + MAX_NOTE + ' characters.',
    noteFull: 'This interview already has the most notes it can hold.',
    noteFailed: 'The note was not saved. Your text is still here; try again.',
  };

  /** The signed link from "?i=&e=&t=", or null for anything not of the shape we send. */
  function linkFromQuery(search) {
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) q[p[0]] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    if (!UUID.test(q.i || '') || !/^\d{1,15}$/.test(q.e || '') || !/^[A-Za-z0-9_-]{43}$/.test(q.t || '')) return null;
    return { i: q.i, e: q.e, t: q.t };
  }

  function linkQuery(link) { return '?e=' + encodeURIComponent(link.e) + '&t=' + encodeURIComponent(link.t); }

  /** What a room answer means (GET or the decision POST). */
  function roomState(status, body) {
    var b = body || {};
    if (status === 200 && b.room && b.room.join && b.room.consent) return { kind: 'ok', room: b.room };
    if (status === 401) return { kind: 'invalid', message: b.reason === 'expired' ? TEXT.expired : TEXT.invalid };
    if (status === 403 && b.opensAt) return { kind: 'not_open', opensAt: b.opensAt };
    if (status === 410) return { kind: 'gone', reason: b.reason || 'ended', message: b.error || TEXT.invalid };
    if (status === 409) return { kind: 'not_ready', message: b.error || TEXT.notReady };
    if (status === 429) return { kind: 'busy', message: TEXT.busy };
    return { kind: 'failed', message: TEXT.failed };
  }

  /** What the guide answer means: the questions (or why there are none) and the notes. */
  function guideState(status, body) {
    var b = body || {};
    if (status === 200 && b.guide && Array.isArray(b.guide.notes)) {
      var qs = b.guide.questions;
      return { kind: 'ok', questions: Array.isArray(qs) ? qs : [], questionsNote: qs === null ? TEXT.questionsFailed : (Array.isArray(qs) && qs.length ? '' : TEXT.noQuestions), notes: b.guide.notes };
    }
    if (status === 401) return { kind: 'invalid', message: b.reason === 'expired' ? TEXT.expired : TEXT.invalid };
    if (status === 410 || status === 404) return { kind: 'gone', message: b.error || TEXT.invalid };
    return { kind: 'failed', message: TEXT.failed };
  }

  /** A draft note, checked before it is sent: the trimmed text, or the problem in plain words. */
  function checkNote(text) {
    var t = String(text || '').trim();
    if (!t) return { body: '', error: TEXT.noteEmpty };
    if (t.length > MAX_NOTE) return { body: '', error: TEXT.noteLong };
    return { body: t, error: null };
  }

  /** What a note answer means. 201 = saved; 200 = the same Save again (stored once). */
  function noteState(status, body) {
    var b = body || {};
    if ((status === 201 || status === 200) && b.note && b.guide) return { kind: 'saved', guide: guideState(200, { guide: b.guide }) };
    if (status === 409) return { kind: 'full', message: TEXT.noteFull };
    if (status === 400) return { kind: 'fix', message: b.error || TEXT.noteFailed };
    if (status === 401) return { kind: 'invalid', message: b.reason === 'expired' ? TEXT.expired : TEXT.invalid };
    if (status === 410) return { kind: 'gone', message: b.error || TEXT.invalid };
    if (status === 429) return { kind: 'busy', message: TEXT.busy };
    return { kind: 'failed', message: TEXT.noteFailed };
  }

  /** The way in, from the room: decide first; starting (poll); withheld (the reason); ready (the meeting link). */
  function joinView(room) {
    var j = (room && room.join) || {};
    if (!room || room.yourDecision === null || j.status === 'decide_first') return { kind: 'decide' };
    if (j.status === 'ready' && /^https:\/\//.test(String(j.url || ''))) return { kind: 'ready', url: j.url };
    if (j.status === 'starting') return { kind: 'starting', message: j.reason || 'Turning the recording on.' };
    return { kind: 'withheld', message: j.reason || TEXT.notReady };
  }

  function mine(room) {
    return room && room.yourDecision === 'consent' ? 'Your side said yes to recording.' : 'Your side said no to recording. The interview goes ahead unrecorded, with no replay.';
  }

  /** "Mon, Nov 23, 9:00 AM" in Central, whatever the viewer's zone. */
  function central(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /** Milliseconds until the room opens, when that is worth waiting for on this page (0 to 6 hours); else null. */
  function openWait(opensAt, now) {
    var w = Date.parse(opensAt) - now + 500;
    return w > 0 && w <= 6 * 60 * 60 * 1000 ? w : null;
  }

  return { CONSENT: CONSENT, TEXT: TEXT, MAX_NOTE: MAX_NOTE, POLL_MS: POLL_MS, MAX_POLLS: MAX_POLLS, linkFromQuery: linkFromQuery, linkQuery: linkQuery,
    roomState: roomState, guideState: guideState, checkNote: checkNote, noteState: noteState, joinView: joinView, mine: mine, central: central, openWait: openWait };
}));
