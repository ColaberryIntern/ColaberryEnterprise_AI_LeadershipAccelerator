/*
 * hire.refactored.ai - the booking page (/book/?t=<token>, Career Prep CP8.2, kit F4 step 3). Browser only; every rule
 * it applies lives in booking-model.js and is tested there.
 *
 * The employer opens the link from our reply, sees the candidate's FIRST name, the role, the length, the recording
 * notice and the open times (Central, with their own zone beside), picks one, may add interviewers, and confirms ONCE:
 * the button is disabled while a confirm is in flight, so a double click sends one request (and the API answers a
 * repeat of the same time as the same booking). The page never shows the learner's email or phone (the API never
 * sends them) and never a meeting provider link: the booked answer carries the consent-room PAGE link only.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var M = window.HireBookingModel;
  var doc = document;
  var esc = C.esc;
  var panel = doc.getElementById('panel');
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var token = M.tokenFromQuery(window.location.search);
  var tz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }());
  var S = { view: null, slot: null, busy: false, notice: '', interviewers: '' };

  function show(html, focus) {
    panel.innerHTML = html;
    var h = panel.querySelector('h2');
    if (focus && h) h.focus();
  }
  function stop(title, message) { show('<h2 tabindex="-1">' + esc(title) + '</h2><p class="lede">' + esc(message) + '</p>', true); }

  function slotButton(s) {
    var on = S.slot === s.startsAt;
    return '<button type="button" class="slot" data-slot="' + esc(s.startsAt) + '" aria-pressed="' + on + '">'
      + '<b>' + esc(s.time) + '</b>' + (s.local ? '<span>' + esc(s.local.time) + ' your time</span>' : '') + '</button>';
  }

  function renderReady(focus) {
    var v = S.view;
    var groups = M.groupSlots(v.slots).map(function (g) {
      return '<div class="day"><h3>' + esc(g.day) + '</h3><div class="slots">' + g.slots.map(slotButton).join('') + '</div></div>';
    }).join('');
    show('<h2 tabindex="-1">' + esc(M.heading(v)) + '</h2>'
      + '<p class="lede">' + esc(M.roleLine(v)) + '. Times are shown in Central time' + (v.slots.some(function (s) { return s.local; }) ? ', with yours beside them' : '') + '.</p>'
      + '<p class="rec">' + esc(v.recordingNotice || '') + '</p>'
      + (S.notice ? '<p class="notice" role="alert">' + esc(S.notice) + '</p>' : '')
      + '<div class="days">' + groups + '</div>'
      + '<label class="who-else" for="iv">Other interviewers (optional, up to ' + M.MAX_INTERVIEWERS + ' emails)</label>'
      + '<input id="iv" type="text" inputmode="email" autocomplete="off" value="' + esc(S.interviewers) + '" />'
      + '<div class="acts start"><button type="button" class="btn btn-primary" id="confirm"' + (!S.slot || S.busy ? ' disabled' : '') + '>'
      + (S.busy ? 'Booking...' : 'Confirm this time') + '</button></div>', focus);
  }

  function renderBooked(b) {
    var when = M.findSlot(S.view && S.view.slots, b.startsAt);
    show('<div class="done-head"><span class="success-ico" aria-hidden="true">&#10003;</span><div><h2 tabindex="-1">Booked</h2>'
      + '<p class="lede">' + esc(when ? when.central + (when.local ? ' (' + when.local + ')' : '') : b.startsAt) + ', ' + esc(String(b.minutes)) + ' minutes.</p></div></div>'
      + '<p>Save this room link. You join the interview from it at the start time:</p>'
      + '<p class="room"><a href="' + esc(b.roomPage) + '">' + esc(b.roomPage) + '</a></p>'
      + '<p class="rec">' + esc((S.view && S.view.recordingNotice) || '') + '</p>', true);
  }

  function load(notice) {
    var url = api + '/api/public/booking/' + encodeURIComponent(token) + (tz ? '?tz=' + encodeURIComponent(tz) : '');
    return C.fetchJson(url, 10000).then(function (r) {
      var st = M.viewState(r.status, r.body);
      if (st.kind === 'ready') { S.view = r.body.booking; S.notice = notice || ''; if (!M.findSlot(S.view.slots, S.slot)) S.slot = null; renderReady(!!notice); return; }
      if (st.kind === 'gone') { stop(st.reason === 'used' ? 'This link was already used' : st.reason === 'closed' ? 'This interview is no longer open' : 'This booking link has expired', st.message); return; }
      if (st.kind === 'arranging') { stop('Times are being arranged', st.message); return; }
      if (st.kind === 'empty') { stop(M.heading(r.body.booking), st.message); return; }
      stop(st.kind === 'invalid' ? 'This link is not valid' : 'Something went wrong', st.message);
    });
  }

  function confirm() {
    if (S.busy || !S.slot) return;
    var people = M.parseInterviewers(S.interviewers);
    if (people.error) { S.notice = people.error; renderReady(false); return; }
    S.busy = true; S.notice = ''; renderReady(false);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    fetch(api + '/api/public/booking/' + encodeURIComponent(token) + '/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ slot: S.slot, tz: tz || 'America/Chicago', interviewers: people.emails }), signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) { return { status: res.status, body: b }; });
    }, function () { return { status: 0, body: null }; }).then(function (r) {
      if (timer) clearTimeout(timer);
      S.busy = false;
      var st = M.confirmState(r.status, r.body);
      if (st.kind === 'booked') { renderBooked(st.booked); return; }
      if (st.kind === 'taken') { S.slot = null; load(st.message); return; }
      if (st.kind === 'gone' || st.kind === 'invalid' || st.kind === 'arranging') { stop(st.kind === 'arranging' ? 'Times are being arranged' : 'This link can no longer book', st.message); return; }
      S.notice = st.message; renderReady(false);
    });
  }

  panel.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-slot]') : null;
    if (b && !S.busy) { S.slot = b.getAttribute('data-slot'); S.notice = ''; renderReady(false); var p = panel.querySelector('[data-slot="' + S.slot + '"]'); if (p) p.focus(); return; }
    if (e.target.id === 'confirm') confirm();
  });
  panel.addEventListener('input', function (e) { if (e.target.id === 'iv') S.interviewers = e.target.value; });

  if (!token) stop('This link is not valid', M.TEXT.invalid);
  else load('').catch(function () { stop('Something went wrong', M.TEXT.failed); });
}());
