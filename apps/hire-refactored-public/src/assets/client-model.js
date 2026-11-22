/*
 * hire.refactored.ai - the employer portal's pure logic (/client/, Career Prep CP10.2, kit "Employer portal"). No DOM:
 * the sign-in link, what each API answer means, the candidate cards, the Interviews and Offers tables, and the Make an
 * offer form with its live fee estimate. client-portal.js renders it; node's runner tests it.
 *
 * The API (backend routes/hireClientRoutes.ts) is reached with the session the sign-in link gives; the session lives in
 * this tab only (sessionStorage), never in an address. The fee shown while typing uses the SERVER's formula and the
 * rate the server says is in force (feeRateBp); the server computes the stored fee itself and never reads it from here.
 * NEVER INVENTS: a fact the API does not give (readiness, verified projects, a resume) is shown as absent, in words.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireClientModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PROFILE = /^https:\/\/[^/\s"'<>]+\/talent\/[^/?#\s"'<>]+\/$/;
  var ROOM = /^https:\/\/[^/\s"'<>]+\/room\/\?i=[0-9a-f-]{36}&e=\d+&t=[A-Za-z0-9_-]{43}$/;
  var WEEKS = 52;
  var DEFAULT_HOURS = 40;
  var SESSION_KEY = 'hire-client-session';
  /* The agreement checkbox's words, and the version name stored with every offer (agreement_text_version). Change the
     words and the version together. */
  var AGREEMENT_VERSION = 'f7-fee-2026-11';
  function agreementText(name) { return 'I agree to pay Refactored.ai the placement fee above if ' + (name || 'the candidate') + ' accepts.'; }

  var TEXT = {
    signIn: 'Enter your work email and we will send you a sign-in link.',
    linkBad: 'This sign-in link is no longer valid. Links work once and expire after an hour. Ask for a new one below.',
    signedOut: 'Your session ended. Sign in again to continue.',
    failed: 'We could not reach the employer portal. Check your connection and try again.',
    emailBad: 'Enter a full email address.',
    noCandidates: 'No candidates have been put forward to you yet. Your Refactored.ai contact adds them here.',
    noInterviews: 'No interviews yet.',
    noOffers: 'No offers yet.',
    readinessNone: 'Readiness not yet assessed',
    payBlank: 'Enter the pay to see the fee.',
    projectsNone: 'None verified yet',
    projectsFailed: 'Could not load just now',
    resumeNone: 'No reviewed Hire profile yet',
    bestAnswer: 'Not shared yet',
    followUpsOff: 'Follow-up emails are not switched on yet, so none was scheduled.',
    bookOff: 'Booking from the portal is not switched on yet. Your Refactored.ai contact can set up the interview for you.',
    sent: 'Offer sent.',
    notSent: 'The offer was not sent.',
    replay: 'This offer was already sent. Nothing new was sent.',
  };

  function query(search) {
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) { try { q[p[0]] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { q[p[0]] = ''; } }
    });
    return q;
  }
  /** The sign-in token from "?t=", or null for anything not of the shape we send (a uuid). */
  function tokenFromQuery(search) { var t = query(search).t || ''; return UUID.test(t) ? t : null; }

  /** A stored session, or null when it is missing, malformed or past its end. */
  function readSession(raw, now) {
    try {
      var s = JSON.parse(raw || 'null');
      if (s && typeof s.token === 'string' && s.token && typeof s.until === 'number' && s.until > now) return s;
    } catch (e) { /* a damaged value is no session */ }
    return null;
  }
  function makeSession(body, now) { return { token: body.token, until: now + Math.max(0, Number(body.expiresIn) || 0) * 1000 - 60000, clientName: String(body.clientName || '') }; }

  /** What a data answer means: ok, signed out (401), or a plain failure. */
  function dataState(status, body) {
    if (status === 200 && body) return { kind: 'ok', body: body };
    if (status === 401) return { kind: 'signed_out', message: TEXT.signedOut };
    return { kind: 'failed', message: (body && status >= 400 && status < 500 && body.error) || TEXT.failed };
  }

  function money(cents) {
    var c = Math.round(Number(cents) || 0); var d = Math.floor(c / 100); var r = c % 100;
    return '$' + d.toLocaleString('en-US') + (r ? '.' + String(r).padStart(2, '0') : '');
  }
  function pct(rateBp) { return (Math.round(rateBp) / 100).toString() + '%'; }

  /** Dollars typed as "105000", "105,000" or "52.50" to whole cents; null for anything else. */
  function cents(text) {
    var t = String(text == null ? '' : text).replace(/[$,\s]/g, '');
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
    var p = t.split('.');
    return Number(p[0]) * 100 + Number(((p[1] || '') + '00').slice(0, 2));
  }

  /** The pay as the API takes it, or the plain reason it is not valid (the server's rules, feeCalculator.payProblem). */
  function pay(form) {
    if (form.basis === 'hourly') {
      var rate = cents(form.rate); var hours = Number(form.hours);
      if (rate === null || rate < 100) return { problem: 'The hourly rate must be at least $1.' };
      if (rate > 100000) return { problem: 'The hourly rate can be at most $1,000.' };
      if (!(hours >= 1 && hours <= 80)) return { problem: 'Hours a week must be 1 to 80.' };
      if (Math.round(hours * 10) !== hours * 10) return { problem: 'Hours a week can have at most one decimal place.' };
      return { pay: { basis: 'hourly', rateCents: rate, hoursPerWeek: hours } };
    }
    var salary = cents(form.salary);
    if (salary === null || salary < 100) return { problem: 'The yearly salary must be at least $1.' };
    if (salary > 200000000) return { problem: 'The yearly salary can be at most $2,000,000.' };
    return { pay: { basis: 'yearly', salaryCents: salary } };
  }

  /** Nothing typed in the pay box yet (the calculation shows $0 and no complaint). */
  function payBlank(form) { return !String((form.basis === 'hourly' ? form.rate : form.salary) || '').trim(); }

  /** The live estimate: first-year salary and fee in cents, by the server's formula (half-up on the fee). */
  function estimate(form, rateBp) {
    var p = pay(form);
    if (p.problem) return { ok: false, problem: p.problem };
    var fy = p.pay.basis === 'yearly' ? p.pay.salaryCents : Math.round((p.pay.rateCents * Math.round(p.pay.hoursPerWeek * 10) * WEEKS) / 10);
    return { ok: true, pay: p.pay, firstYearCents: fy, feeCents: Math.floor((fy * rateBp + 5000) / 10000) };
  }

  /** 5:00 PM Central on a "YYYY-MM-DD" date, as an ISO instant (daylight saving handled by the zone itself). */
  function centralFivePm(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return null;
    var want = Date.UTC(+m[1], +m[2] - 1, +m[3], 17, 0);
    var guess = want + 6 * 3600000;
    for (var i = 0; i < 2; i += 1) {
      var f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(guess)).reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
      guess -= Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour, +f.minute) - want;
    }
    return new Date(guess).toISOString();
  }

  /** Whether Send can be pressed, and why not (the agreement box first, as the page says). */
  function sendState(form, rateBp, busy) {
    if (busy) return { can: false, why: 'Sending...' };
    if (!UUID.test(form.enrollmentId || '')) return { can: false, why: 'Choose a candidate.' };
    if (!String(form.role || '').trim()) return { can: false, why: 'Enter the role title.' };
    if (String(form.role).trim().length > 200) return { can: false, why: 'The role can be at most 200 characters.' };
    if (payBlank(form)) return { can: false, why: TEXT.payBlank };
    var e = estimate(form, rateBp);
    if (!e.ok) return { can: false, why: e.problem };
    if (form.agreed !== true) return { can: false, why: 'Tick the box to agree to the placement fee before sending.' };
    return { can: true, why: '' };
  }

  /** The make-offer request body (routes/hireClientRoutes.ts MakeOfferBody). The page never sends a fee. */
  function offerBody(form, clientKey) {
    return { clientKey: clientKey, enrollmentId: form.enrollmentId, role: String(form.role).trim(), pay: pay(form).pay,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(form.startDate || '') ? form.startDate : null, respondBy: centralFivePm(form.respondBy),
      agreed: true, agreementTextVersion: AGREEMENT_VERSION };
  }

  /** What a make-offer answer means: 201 sent, 200 the same Send again (stored once), 400 the reason, 401, else failed. */
  function offerState(status, body) {
    var b = body || {};
    if ((status === 201 || status === 200) && b.offer) return { kind: 'sent', offer: b.offer, message: b.replay ? TEXT.replay : TEXT.sent };
    if (status === 400) return { kind: 'fix', message: b.error || TEXT.failed };
    if (status === 401) return { kind: 'signed_out', message: TEXT.signedOut };
    if (status === 404) return { kind: 'fix', message: 'That candidate or interview is not one of yours.' };
    return { kind: 'failed', message: TEXT.failed };
  }

  return { TEXT: TEXT, WEEKS: WEEKS, DEFAULT_HOURS: DEFAULT_HOURS, SESSION_KEY: SESSION_KEY, AGREEMENT_VERSION: AGREEMENT_VERSION, PROFILE: PROFILE, ROOM: ROOM,
    agreementText: agreementText, tokenFromQuery: tokenFromQuery, readSession: readSession, makeSession: makeSession, dataState: dataState, money: money, pct: pct,
    cents: cents, pay: pay, payBlank: payBlank, estimate: estimate, centralFivePm: centralFivePm, sendState: sendState, offerBody: offerBody, offerState: offerState };
}));
