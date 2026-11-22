/*
 * hire.refactored.ai - the employer portal (/client/, Career Prep CP10.2, kit "Employer portal"). Browser only; every
 * rule it applies lives in client-model.js / client-views.js and is tested there.
 *
 * Sign-in: the emailed link /client/?t=<token> is redeemed AT ONCE and the token is removed from the address bar
 * (history.replaceState) before anything else loads; the session it gives is kept in this tab only (sessionStorage),
 * never in an address. Without a session the page asks for a work email (one message whatever the address).
 * Signed in: Candidates (cards), Interviews, Offers and fees, Follow-ups (the table, Cancel while still scheduled;
 * Schedule a follow-up is client-followups.js), and Make an offer with the live fee estimate; Send stays
 * disabled until the agreement box is ticked. One key per draft offer: a retry of an unchanged draft is stored once;
 * any edit makes a new draft. Every value rendered is escaped; links are used only when they match our own shapes.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var M = window.HireClientModel;
  var V = window.HireClientViews;
  var doc = document;
  var esc = C.esc;
  var main = doc.getElementById('portal');
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '') + '/api/hire/client';
  var S = { session: null, view: 'candidates', data: null, notice: '', form: null, busy: false, key: '', formMsg: '' };

  function store(fn) { try { return fn(window.sessionStorage); } catch (e) { return null; } }
  function newKey() {
    var c = window.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16); c.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function call(method, path, body) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : null;
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (S.session) headers.Authorization = 'Bearer ' + S.session.token;
    return fetch(api + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl ? ctrl.signal : undefined, referrerPolicy: 'no-referrer' })
      .then(function (res) { return res.json().catch(function () { return null; }).then(function (b) { return { status: res.status, body: b }; }); }, function () { return { status: 0, body: null }; })
      .then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  function signInHtml(message) {
    return '<section class="card cp-signin" aria-labelledby="si-h"><div class="label">Employer portal</div><h1 id="si-h" tabindex="-1">Sign in</h1>'
      + (message ? '<p class="notice" role="alert" data-testid="signin-msg">' + esc(message) + '</p>' : '')
      + '<p class="lede">' + esc(M.TEXT.signIn) + '</p><form id="signin" novalidate><label class="field-label" for="email">Work email</label>'
      + '<input id="email" type="email" autocomplete="email" required maxlength="254"><div class="acts start"><button class="btn btn-primary" type="submit">Send me a sign-in link</button></div></form></section>';
  }
  function signedOut(message) {
    S.session = null; S.data = null; store(function (s) { s.removeItem(M.SESSION_KEY); });
    doc.getElementById('who').textContent = '';
    main.innerHTML = signInHtml(message);
  }
  function requestLink(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { main.innerHTML = signInHtml(M.TEXT.emailBad); return; }
    main.innerHTML = '<section class="card cp-signin"><p class="lede">Sending...</p></section>';
    call('POST', '/auth/request-link', { email: email }).then(function (r) {
      var msg = r.status === 202 && r.body && r.body.message ? r.body.message : M.TEXT.failed;
      main.innerHTML = '<section class="card cp-signin"><div class="label">Employer portal</div><h1 tabindex="-1">Check your email</h1><p class="lede" data-testid="signin-sent">' + esc(msg) + '</p></section>';
    });
  }

  function load() {
    main.innerHTML = '<p class="lede">Loading your candidates...</p>';
    return Promise.all([call('GET', '/candidates'), call('GET', '/interviews'), call('GET', '/offers'), call('GET', '/follow-ups')]).then(function (rs) {
      var st = rs.map(function (r) { return M.dataState(r.status, r.body); });
      if (st.some(function (x) { return x.kind === 'signed_out'; })) { signedOut(M.TEXT.signedOut); return; }
      var bad = st.slice(0, 3).filter(function (x) { return x.kind !== 'ok'; })[0];
      if (bad) { main.innerHTML = '<p class="notice" role="alert">' + esc(bad.message) + '</p><div class="acts start"><button type="button" class="btn btn-ghost" data-act="reload">Try again</button></div>'; return; }
      var fu = st[3].kind === 'ok' ? st[3].body : null; // Follow-ups failing to load never hides the rest; its page says so
      S.data = { candidates: st[0].body.candidates, profilesUnavailable: st[0].body.profilesUnavailable === true, feeRateBp: st[0].body.feeRateBp,
        interviews: st[1].body.interviews, offers: st[2].body.offers, followUps: fu ? fu.followUps : null, mailOn: fu ? fu.mailOn === true : null };
      render();
    });
  }

  function pill(s) { return '<span class="pill ' + esc(s.tone) + '" data-testid="cand-status">' + esc(s.text) + '</span>'; }
  function cardHtml(c) {
    var k = V.card(c, S.data);
    var score = k.readiness.value ? '<span class="score" title="Interview readiness">' + esc(k.readiness.value) + '</span><small>' + esc(k.readiness.text) + '</small>' : '<small>' + esc(k.readiness.text) + '</small>';
    var resume = k.resume ? '<a class="btn btn-ghost btn-sm" data-testid="act-resume" href="' + esc(k.resume) + '" target="_blank" rel="noopener noreferrer">Digital resume</a>'
      : '<button type="button" class="btn btn-ghost btn-sm" data-testid="act-resume" disabled title="' + esc(k.resumeNote) + '">Digital resume</button>';
    return '<article class="card cp-card" data-testid="cand-card" data-id="' + esc(k.id) + '"><div class="cp-head"><span class="av lg" data-testid="cand-initials" aria-hidden="true">' + esc(k.initials) + '</span>'
      + '<div class="cp-who"><h3 data-testid="cand-name">' + esc(k.name) + '</h3><span class="muted small" data-testid="cand-role">' + esc(k.role) + '</span><div>' + pill(k.status) + '</div></div>'
      + '<div class="cp-ready" data-testid="cand-readiness">' + score + '</div></div>'
      + '<div class="li"><span class="label">Projects</span><span class="small grow" data-testid="cand-projects">' + esc(k.projects) + '</span></div>'
      + '<div class="li"><span class="label">Best answer</span><span class="small grow faint" data-testid="cand-best">' + esc(k.bestAnswer) + '</span></div>'
      + '<div class="cp-acts">' + resume + '<button type="button" class="btn btn-ghost btn-sm" data-testid="act-book" data-act="book">Book an interview</button>'
      + '<button type="button" class="btn btn-primary btn-sm" data-testid="act-offer" data-act="offer" data-id="' + esc(k.id) + '">Make an offer</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" data-testid="act-followup" data-act="followup" data-id="' + esc(k.id) + '">Schedule a follow-up</button></div><p class="faint small">' + esc(k.putForward) + '</p></article>';
  }
  function candidatesHtml() {
    var d = S.data;
    if (!d.candidates.length) return '<p class="lede" data-testid="empty-candidates">' + esc(M.TEXT.noCandidates) + '</p>';
    return '<div class="cp-grid">' + d.candidates.map(cardHtml).join('') + '</div>';
  }
  function interviewsHtml() {
    var rows = S.data.interviews.map(V.interviewRow);
    if (!rows.length) return '<p class="lede">' + esc(M.TEXT.noInterviews) + '</p>';
    return '<div class="card cp-tablewrap"><table class="tbl" data-testid="interviews-table"><thead><tr><th>Candidate</th><th>When · Central</th><th>Role</th><th>Status</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><td><b>' + esc(r.candidate) + '</b></td><td class="small">' + esc(r.when) + '</td><td class="small">' + esc(r.what) + '</td><td><span class="pill ' + esc(r.status.tone) + '">' + esc(r.status.text) + '</span></td><td>'
          + (r.join ? '<a class="btn btn-primary btn-sm" href="' + esc(r.join) + '" target="_blank" rel="noopener noreferrer">Join the room</a>' : '') + '</td></tr>';
      }).join('') + '</tbody></table><p class="faint small">Every interview runs in the Refactored room. Your notes are visible to your team only.</p></div>';
  }
  function offersHtml() {
    var d = S.data; var k = V.kpis(d.offers);
    var kpi = function (id, label, v, sub) { return '<div class="card kpi" data-testid="' + id + '"><div class="label">' + esc(label) + '</div><div class="v">' + esc(v) + '</div>' + (sub ? '<div class="faint small">' + esc(sub) + '</div>' : '') + '</div>'; };
    var rows = d.offers.map(V.offerRow);
    return '<div class="cp-kpis">' + kpi('kpi-out', 'Offers out', String(k.out)) + kpi('kpi-accepted', 'Accepted', String(k.accepted)) + kpi('kpi-fees', 'Fees on accepted offers', k.fees, M.pct(d.feeRateBp) + ' of first-year salary') + '</div>'
      + '<div class="card cp-tablewrap"><table class="tbl" data-testid="offers-table"><thead><tr><th>Candidate · role</th><th>Pay basis</th><th class="num">First-year salary</th><th class="num">Placement fee</th><th>Start date</th><th>Status</th><th>Invoice</th></tr></thead><tbody>'
      + (rows.length ? rows.map(function (r) {
        return '<tr><td><b>' + esc(r.candidate) + '</b><br><span class="faint small">' + esc(r.role) + '</span></td><td class="small mono">' + esc(r.basis) + '</td><td class="num">' + esc(r.firstYear) + '</td><td class="num">' + esc(r.fee)
          + '</td><td class="small">' + esc(r.start) + '</td><td><span class="pill ' + esc(r.status.tone) + '">' + esc(r.status.text) + '</span></td><td class="small">' + esc(r.invoice) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="faint">' + esc(M.TEXT.noOffers) + '</td></tr>')
      + '</tbody></table><div class="callout" data-testid="fee-callout">' + esc(V.feeCallout(d.feeRateBp)) + '</div></div>';
  }

  function followUpsHtml() {
    var d = S.data; var F = window.HireFollowUpModel;
    if (d.followUps === null) return '<p class="notice" role="alert" data-testid="followups-failed">' + esc(F.TEXT.loadFailed) + '</p>';
    var rows = d.followUps.map(F.row);
    return (d.mailOn === false ? '<p class="callout" data-testid="mail-off">' + esc(F.TEXT.mailOff) + '</p>' : '')
      + '<div class="card cp-tablewrap"><table class="tbl" data-testid="followups-table"><thead><tr><th>To</th><th>Subject</th><th>When · Central</th><th>Status</th><th>Tracking</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>'
      + (rows.length ? rows.map(function (r) {
        return '<tr data-testid="followup-row"><td><b>' + esc(r.to) + '</b></td><td>' + esc(r.subject) + '</td><td class="small">' + esc(r.when) + '</td><td><span class="pill ' + esc(r.status.tone) + '">' + esc(r.status.text)
          + '</span></td><td class="small">' + esc(r.tracking) + '</td><td>' + (r.canCancel ? '<button type="button" class="btn btn-ghost btn-sm" data-act="fu-cancel" data-id="' + esc(r.id) + '">Cancel</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="faint">' + esc(F.TEXT.none) + '</td></tr>')
      + '</tbody></table><p class="faint small">Sent by Refactored.ai in your name at ' + esc(S.session ? S.session.clientName : 'your company') + '. Replies come to you.</p></div>';
  }

  var VIEWS = { candidates: ['Candidates', 'The people Refactored.ai has put forward for your roles.', candidatesHtml], interviews: ['Interviews', 'Booked and held in the Refactored room.', interviewsHtml],
    offers: ['Offers and fees', 'Every offer, its first-year salary and the placement fee.', offersHtml], followups: ['Follow-ups', 'Emails to candidates, scheduled and tracked.', followUpsHtml] };
  function render() {
    doc.getElementById('who').textContent = S.session ? S.session.clientName : '';
    var v = VIEWS[S.view];
    main.innerHTML = '<nav class="cp-tabs" aria-label="Portal pages">' + Object.keys(VIEWS).map(function (k) { return '<button type="button" data-view="' + k + '" aria-pressed="' + (k === S.view) + '">' + esc(VIEWS[k][0]) + '</button>'; }).join('') + '</nav>'
      + '<div class="cp-title"><div><h1 tabindex="-1">' + esc(v[0]) + '</h1><p class="lede">' + esc(v[1]) + '</p></div>' + (S.view === 'offers' && S.data.candidates.length ? '<button type="button" class="btn btn-primary" data-act="offer">Make an offer</button>' : '')
      + (S.view === 'followups' && S.data.candidates.length ? '<button type="button" class="btn btn-primary" data-act="followup">Schedule a follow-up</button>' : '') + '</div>'
      + (S.notice ? '<p class="callout" role="status" data-testid="notice">' + esc(S.notice) + '</p>' : '') + v[2]();
  }

  main.addEventListener('submit', function (e) { if (e.target.id === 'signin') { e.preventDefault(); requestLink(String(doc.getElementById('email').value || '').trim()); } });
  main.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-view],[data-act]') : null;
    if (!t) return;
    if (t.hasAttribute('data-view')) { S.view = t.getAttribute('data-view'); S.notice = ''; render(); return; }
    var act = t.getAttribute('data-act');
    if (act === 'reload') load();
    else if (act === 'book') { S.notice = M.TEXT.bookOff; render(); }
    else if (act === 'followup') window.HireClientFollowUps.open(t.getAttribute('data-id'));
    else if (act === 'fu-cancel') window.HireClientFollowUps.cancel(t.getAttribute('data-id'));
    else if (act === 'offer') window.HireClientOffer.open(t.getAttribute('data-id'));
  });
  window.HireClientPortal = { state: S, call: call, render: render, load: load, signedOut: signedOut, newKey: newKey };

  function start() {
    var token = M.tokenFromQuery(window.location.search);
    var hadLink = /[?&]t=/.test(window.location.search);
    if (hadLink) window.history.replaceState(null, '', window.location.pathname); // the link never stays in the address bar
    if (hadLink && !token) { signedOut(M.TEXT.linkBad); return null; }
    if (token) {
      return call('POST', '/auth/redeem', { token: token }).then(function (r) {
        if (r.status !== 200 || !r.body || !r.body.token) { signedOut(r.status === 401 ? M.TEXT.linkBad : M.TEXT.failed); return; }
        S.session = M.makeSession(r.body, Date.now());
        store(function (s) { s.setItem(M.SESSION_KEY, JSON.stringify(S.session)); });
        return load();
      });
    }
    S.session = M.readSession(store(function (s) { return s.getItem(M.SESSION_KEY); }), Date.now());
    if (S.session) return load();
    signedOut('');
    return null;
  }
  try { start(); } catch (e) { signedOut(M.TEXT.failed); }
}());
