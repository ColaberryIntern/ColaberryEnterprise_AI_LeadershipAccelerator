/*
 * hire.refactored.ai - the booking page's pure logic (/book/?t=<token>, Career Prep CP8.2, kit F4 step 3).
 * No DOM: what the link asks for, what each API answer means for the page, the day groups of open times, the
 * interviewer list, and the booked summary. booking.js renders it; node's runner tests it.
 *
 * The API (backend routes/publicBookingRoutes.ts) sends each open time as a UTC instant with two labels already made:
 * `central` ("Mon, Nov 23, 9:00 AM CST") and `local` (the same time in the zone the page asked for, or null when that
 * zone is Central). Nothing here assumes the browser's zone.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireBookingModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TOKEN = /^[A-Za-z0-9_-]{43}$/;
  var EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
  var MAX_INTERVIEWERS = 5;
  var TEXT = {
    invalid: 'This booking link is not valid. Check that the whole link was copied, or reply to the email it came in.',
    failed: 'We could not reach the booking service. Check your connection and try again.',
    busy: 'Too many tries from here just now. Please wait a few minutes and try again.',
    taken: 'That time was just taken. Here are the times still open.',
    empty: 'There are no open times in the next 7 days. Reply to the email this link came in and we will find one.',
    arranging: 'Times are being arranged with the candidate. We will be in touch.',
  };

  /** The token from "?t=...", or null for anything that is not the shape we send. */
  function tokenFromQuery(search) {
    var m = /[?&]t=([^&#]*)/.exec(String(search || ''));
    var t = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
    return TOKEN.test(t) ? t : null;
  }

  /** What a page-data answer means: ready, empty, arranging, gone (used, expired, closed), invalid, busy or failed. */
  function viewState(status, body) {
    var b = body || {};
    if (status === 200 && b.booking) {
      if (b.booking.reason === 'arranging') return { kind: 'arranging', message: TEXT.arranging };
      return Array.isArray(b.booking.slots) && b.booking.slots.length ? { kind: 'ready' } : { kind: 'empty', message: TEXT.empty };
    }
    if (status === 410) return { kind: 'gone', reason: b.reason || 'expired', message: b.error || TEXT.invalid };
    if (status === 404 || status === 400) return { kind: 'invalid', message: TEXT.invalid };
    if (status === 429) return { kind: 'busy', message: TEXT.busy };
    return { kind: 'failed', message: TEXT.failed };
  }

  /** What a confirm answer means for the page. */
  function confirmState(status, body) {
    var b = body || {};
    if (status === 200 && b.booked) return { kind: 'booked', booked: b.booked };
    if (status === 409) return b.reason === 'arranging' ? { kind: 'arranging', message: TEXT.arranging } : { kind: 'taken', message: TEXT.taken };
    if (status === 410) return { kind: 'gone', reason: b.reason || 'used', message: b.error || TEXT.invalid };
    if (status === 404) return { kind: 'invalid', message: TEXT.invalid };
    if (status === 400) return { kind: 'fix', message: b.error || 'Check the time and the interviewer emails.' };
    if (status === 429) return { kind: 'busy', message: TEXT.busy };
    return { kind: 'failed', message: TEXT.failed };
  }

  function firstWord(s) { return String(s || '').trim().split(/\s+/)[0] || ''; }
  function heading(view) { var n = firstWord(view && view.candidate); return 'Book your interview with ' + (n && n !== 'the' ? n : 'the candidate'); }
  function roleLine(view) {
    var v = view || {};
    var role = [v.position ? String(v.position).trim() : '', v.company ? 'at ' + String(v.company).trim() : ''].filter(Boolean).join(' ');
    return (role ? role + ', ' : '') + (Number(v.minutes) > 0 ? Number(v.minutes) + ' minutes' : 'length to be confirmed');
  }

  /** "Mon, Nov 23, 9:00 AM CST" -> day "Mon, Nov 23", time "9:00 AM CST". */
  function splitLabel(label) {
    var parts = String(label || '').split(', ');
    return parts.length >= 3 ? { day: parts.slice(0, 2).join(', '), time: parts.slice(2).join(', ') } : { day: String(label || ''), time: '' };
  }

  /** Open times grouped by their Central day, in order; each keeps its own local label (the time only). */
  function groupSlots(slots) {
    var groups = [];
    (Array.isArray(slots) ? slots : []).forEach(function (s) {
      if (!s || !s.startsAt || !s.central) return;
      var c = splitLabel(s.central);
      var last = groups[groups.length - 1];
      if (!last || last.day !== c.day) { last = { day: c.day, slots: [] }; groups.push(last); }
      last.slots.push({ startsAt: s.startsAt, time: c.time, local: s.local ? splitLabel(s.local) : null });
    });
    return groups;
  }

  /** "a@x.com, b@y.com" -> lowercased unique emails, or the first problem in plain words. */
  function parseInterviewers(text) {
    var list = String(text || '').split(/[\s,;]+/).map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
    var seen = {};
    var emails = list.filter(function (e) { if (seen[e]) return false; seen[e] = true; return true; });
    var bad = emails.filter(function (e) { return !EMAIL.test(e) || e.length > 254; })[0];
    if (bad) return { emails: [], error: '"' + bad + '" is not an email address.' };
    if (emails.length > MAX_INTERVIEWERS) return { emails: [], error: 'Add at most ' + MAX_INTERVIEWERS + ' interviewers.' };
    return { emails: emails, error: null };
  }

  /** The slot the booker picked, by its instant, or null when it is no longer on offer. */
  function findSlot(slots, startsAt) {
    return (Array.isArray(slots) ? slots : []).filter(function (s) { return s && s.startsAt === startsAt; })[0] || null;
  }

  return { TEXT: TEXT, MAX_INTERVIEWERS: MAX_INTERVIEWERS, tokenFromQuery: tokenFromQuery, viewState: viewState, confirmState: confirmState,
    heading: heading, roleLine: roleLine, splitLabel: splitLabel, groupSlots: groupSlots, parseInterviewers: parseInterviewers, findSlot: findSlot };
}));
