/*
 * hire.refactored.ai - the employer interview room (/room/?i=&e=&t=, Career Prep CP9.1, kit F5). Browser only; every
 * rule it applies lives in room-model.js and is tested there.
 *
 * The employer (the contact and every interviewer share the one signed link from the booking email) sees the header
 * "RECORDING n OF n CONSENTED", the consent screen (recording and AI scoring of the candidate's voice and words named,
 * "No" with the same weight as "Yes", what any "no" means said plainly), and only after their side's decision, when
 * the server says the room is ready, "Open the meeting". Beside it: the interview guide (this role's questions) and
 * private notes, saved to the platform once per Save (a key per draft, so a double click or a retry stores one note).
 * Each decision and each Save is sent once: the buttons are disabled while one is in flight.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var M = window.HireRoomModel;
  var doc = document;
  var esc = C.esc;
  var panel = doc.getElementById('panel');
  var side = doc.getElementById('side');
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var link = M.linkFromQuery(window.location.search);
  var S = { answer: null, busy: false, polls: 0, timer: null, guide: null, draft: '', key: newKey(), saving: false, noteMsg: '' };

  function newKey() {
    var c = window.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16); c.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function url(tail) { return api + '/api/public/room/' + encodeURIComponent(link.i) + tail + M.linkQuery(link); }
  function postJson(u, body) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (b) { return { status: res.status, body: b }; }); }, function () { return { status: 0, body: null }; })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function top(room) {
    doc.getElementById('title').textContent = room ? [room.company || 'An employer', room.role].filter(Boolean).join(' · ') : '';
    var rec = doc.getElementById('rec');
    rec.className = 'iroom-rec' + (room && room.recording.status === 'on' ? ' on' : '');
    rec.innerHTML = room ? (room.recording.status === 'on' ? '<i aria-hidden="true"></i>' : '') + esc(room.consent.label) : '';
  }
  function stop(title, message, retry) {
    panel.innerHTML = '<h2 tabindex="-1">' + esc(title) + '</h2><p class="lede">' + esc(message) + '</p>' + (retry ? '<div class="acts start"><button type="button" class="btn btn-ghost" id="retry">Try again</button></div>' : '');
  }

  function consentHtml(room) {
    var k = M.CONSENT;
    return '<div class="label">' + esc(M.central(room.startsAt)) + ' Central</div><h2 tabindex="-1">' + esc(k.heading) + '</h2>'
      + '<p id="c-yes">' + esc(k.yes) + '</p><p id="c-no"><b>' + esc(k.no) + '</b></p><p class="lede">' + esc(k.once) + '</p>'
      + '<div class="choices" role="group" aria-label="Recording choice">'
      + '<button type="button" class="choice" data-decide="consent"' + (S.busy ? ' disabled' : '') + '>' + esc(k.consent) + '</button>'
      + '<button type="button" class="choice" data-decide="decline"' + (S.busy ? ' disabled' : '') + '>' + esc(k.decline) + '</button></div>'
      + (S.busy ? '<p class="lede" aria-live="polite">Saving your choice...</p>' : '');
  }
  function joinHtml(room, j) {
    var note = room.recording.note ? '<p class="lede" id="recnote">' + esc(room.recording.note) + '</p>' : '';
    var stalled = j.kind === 'starting' && S.polls >= M.MAX_POLLS;
    var body = j.kind === 'ready'
      ? '<div class="acts start"><a class="btn btn-primary" id="open" href="' + esc(j.url) + '" target="_blank" rel="noopener noreferrer">Open the meeting</a><span class="lede">It opens in Zoom, in a new tab.</span></div>'
      : j.kind === 'starting' && !stalled ? '<p aria-live="polite">' + esc(j.message) + '</p>'
        : '<div class="notice" role="alert"><p>' + esc(stalled ? M.TEXT.stalled : j.message) + '</p><button type="button" class="btn btn-ghost" id="retry">Try again</button></div>';
    return '<h2 tabindex="-1">' + (j.kind === 'ready' ? 'The room is open' : 'Getting the room ready') + '</h2><p id="mine">' + esc(M.mine(room)) + '</p>' + note + body;
  }

  function render() {
    var a = S.answer;
    top(a && a.kind === 'ok' ? a.room : null);
    if (a.kind === 'ok') { var j = M.joinView(a.room); panel.innerHTML = j.kind === 'decide' ? consentHtml(a.room) : joinHtml(a.room, j); schedule(j); return; }
    if (a.kind === 'not_open') { stop('The room is not open yet', 'It opens ' + M.central(a.opensAt) + ' Central, 10 minutes before the start. Keep this page open and it opens by itself.'); var w = M.openWait(a.opensAt, Date.now()); if (w) S.timer = setTimeout(loadRoom, w); return; }
    if (a.kind === 'invalid') { stop('This link cannot open the room', a.message); return; }
    if (a.kind === 'gone') { stop(a.reason === 'ended' ? 'This interview has ended' : 'This room is closed', a.message); return; }
    stop('The room could not load', a.message, true);
  }
  function schedule(j) {
    if (j.kind === 'starting' && S.polls < M.MAX_POLLS) S.timer = setTimeout(function () { S.polls += 1; loadRoom(); }, M.POLL_MS);
  }
  function settle(r) {
    clearTimeout(S.timer);
    S.answer = M.roomState(r.status, r.body);
    render();
    if (!S.guide && (S.answer.kind === 'ok' || S.answer.kind === 'not_open')) loadGuide();
  }
  function loadRoom() { return C.fetchJson(url(''), 10000).then(settle); }
  function decide(d) {
    if (S.busy) return;
    S.busy = true; render();
    postJson(url('/consent'), { decision: d }).then(function (r) { S.busy = false; S.polls = 0; settle(r); });
  }

  function sideHtml() {
    var g = S.guide;
    if (!g) return '<p class="lede">Loading the interview guide...</p>';
    if (g.kind !== 'ok') return '<p class="notice" role="alert">' + esc(g.message) + '</p>';
    var qs = g.questions.length ? '<ol class="qs">' + g.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>' : '<p class="lede" id="noq">' + esc(g.questionsNote) + '</p>';
    var notes = g.notes.length ? '<ul class="notes" id="notes">' + g.notes.map(function (n) { return '<li><time>' + esc(M.central(n.at)) + ' Central</time><p>' + esc(n.body) + '</p></li>'; }).join('') + '</ul>' : '';
    return '<div class="label">Your interview guide</div><h3>Questions for this role</h3>' + qs
      + '<label class="field-label" for="note">Private notes &middot; only your team sees them</label>'
      + '<textarea id="note" maxlength="' + M.MAX_NOTE + '" rows="5">' + esc(S.draft) + '</textarea>'
      + (S.noteMsg ? '<p class="notice" role="alert" id="notemsg">' + esc(S.noteMsg) + '</p>' : '')
      + '<div class="acts start"><button type="button" class="btn btn-primary" id="save"' + (S.saving ? ' disabled' : '') + '>' + (S.saving ? 'Saving...' : 'Save note') + '</button></div>' + notes;
  }
  function renderSide() { side.hidden = false; side.innerHTML = sideHtml(); }
  function loadGuide() { return C.fetchJson(url('/guide'), 10000).then(function (r) { S.guide = M.guideState(r.status, r.body); renderSide(); }); }
  function saveNote() {
    if (S.saving) return;
    var n = M.checkNote(S.draft);
    if (n.error) { S.noteMsg = n.error; renderSide(); return; }
    S.saving = true; S.noteMsg = ''; renderSide();
    postJson(url('/notes'), { key: S.key, body: n.body }).then(function (r) {
      S.saving = false;
      var st = M.noteState(r.status, r.body);
      if (st.kind === 'saved') { S.guide = st.guide; S.draft = ''; S.key = newKey(); } else S.noteMsg = st.message; // a failed Save keeps its key and its text
      renderSide();
      var box = doc.getElementById(st.kind === 'saved' ? 'note' : 'notemsg'); if (box) box.focus();
    });
  }

  panel.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-decide]') : null;
    if (b) { decide(b.getAttribute('data-decide')); return; }
    if (e.target.id === 'retry') { S.polls = 0; loadRoom(); }
  });
  side.addEventListener('click', function (e) { if (e.target.id === 'save') saveNote(); });
  // An edited draft is a new note (a new key); a retry of the same unedited text keeps the key, so it is stored once.
  side.addEventListener('input', function (e) { if (e.target.id === 'note') { S.draft = e.target.value; S.key = newKey(); } });

  if (!link) stop('This link cannot open the room', M.TEXT.invalid);
  else loadRoom().catch(function () { stop('The room could not load', M.TEXT.failed, true); });
}());
