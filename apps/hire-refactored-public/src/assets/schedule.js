/*
 * hire.refactored.ai - the schedule page (/talent/<slug>/schedule/, kit Part 2). Browser only;
 * every rule it applies lives in schedule-model.js and is tested there.
 *
 * Format -> Time -> Your details -> Done, beside a summary card. Also the employer's side of a
 * suggested time (?accept=<id>&t=<token>, from the candidate's "Suggest a time" email).
 *
 * WITHOUT JAVASCRIPT nothing here runs and the shell says so. Step 3 is a REAL form
 * (method=post to the API, hidden format / time / person), so a submit this script fails to
 * intercept still posts, and the API answers with a 303 back to ?sent=1 or ?error=<code>.
 * Nothing on this page ever shows the candidate's email or phone; the API never sends them.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var X = window.HireProfileExtras;
  var M = window.HireScheduleModel;
  var doc = document;
  var esc = C.esc;
  var $ = function (id) { return doc.getElementById(id); };
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var slug = M.slugFromPath(window.location.pathname);
  var query = M.fromQuery(window.location.search);
  var panel = $('panel');
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: X.viewerZone() }).format(new Date());
  var firstMonday = M.mondayOf(today);
  var MAX_WEEKS = 8; // the API offers times up to 60 days out

  var S = {
    step: 1, format: null, caseSlug: null, monday: firstMonday, slot: null, tz: X.viewerZone(),
    slots: [], loading: false, notice: '', errors: [], fields: {}, confirmed: false, busy: false,
    person: null, formats: [], cases: [],
  };

  function firstName() { return S.person ? String(S.person.name).split(/\s+/)[0] : 'They'; }
  function formatOf(id) { return S.formats.filter(function (f) { return f.id === id; })[0] || null; }
  function shortest() { return S.formats.slice().sort(function (a, b) { return a.minutes - b.minutes; })[0]; }

  // ── chrome: stepper and summary ───────────────────────────────────────────
  function renderSteps() {
    $('steps').innerHTML = M.stepItems(S.step).map(function (s) {
      return '<li' + (s.state === 'done' ? ' class="done"' : '') + (s.state === 'current' ? ' aria-current="step"' : '') + '>'
        + '<i aria-hidden="true">' + (s.state === 'done' ? '✓' : s.n) + '</i>' + esc(s.label)
        + (s.state === 'done' ? '<span class="sr-only">, done</span>' : '') + '</li>';
    }).join('');
  }

  function renderSummary() {
    if (!S.person) return;
    $('who').innerHTML = C.avatar({ slug: slug, name: S.person.name, avatarUrl: S.person.avatarUrl }, 56)
      + '<div><b>' + esc(S.person.name) + '</b>' + (S.person.headline ? '<div class="who-role">' + esc(S.person.headline) + '</div>' : '') + '</div>';
    $('sum').innerHTML = M.summaryRows(S, S.formats, S.cases, S.tz).map(function (r) {
      return '<dt>' + esc(r.k) + '</dt><dd' + (r.mono ? ' class="mono"' : '') + '>' + esc(r.v) + '</dd>';
    }).join('');
  }

  // ── the four steps ────────────────────────────────────────────────────────
  function notice() {
    return S.notice ? '<p class="notice" role="alert">' + esc(S.notice) + '</p>' : '';
  }

  function step1() {
    var walk = S.format === 'walkthrough';
    var ready = S.format && (!walk || S.caseSlug);
    return '<h2 tabindex="-1">What kind of conversation?</h2><p class="lede">Every format runs in a Refactored room in the browser. Nothing to install.</p>'
      + notice()
      + S.formats.map(function (f) {
        return '<button type="button" class="opt" data-format="' + esc(f.id) + '" aria-pressed="' + (f.id === S.format) + '">'
          + '<span class="dot" aria-hidden="true"></span><span><b>' + esc(f.name) + '</b><span class="len">' + f.minutes + ' min</span>'
          + '<span class="d">' + esc(M.FORMAT_COPY[f.id] || '') + '</span></span></button>';
      }).join('')
      + (walk ? '<div class="pick"><div class="legend" id="pick-label">Which case study should they walk you through?</div>'
        + '<div class="pick-cases" role="group" aria-labelledby="pick-label">' + S.cases.map(function (c) {
          var url = C.mediaUrl(api, c.look && c.look.coverImageUrl);
          return '<button type="button" data-case="' + esc(c.slug) + '" aria-pressed="' + (c.slug === S.caseSlug) + '" aria-label="' + esc(c.title) + '">'
            + (url ? '<img src="' + esc(url) + '" alt="" decoding="async">' : C.art(c.slug, { n: 6 })) + '</button>';
        }).join('') + '</div>'
        + (S.caseSlug ? '<p class="picked">★ ' + esc((S.cases.filter(function (c) { return c.slug === S.caseSlug; })[0] || {}).title || '') + '</p>' : '') + '</div>' : '')
      + '<div class="acts end"><button type="button" class="btn btn-primary" data-go="2"' + (ready ? '' : ' disabled') + '>Choose a time →</button></div>';
  }

  function zoneSelect() {
    var zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];
    if (zones.indexOf(S.tz) < 0) zones.unshift(S.tz);
    return '<label class="tz" for="tz">Your time zone <select id="tz" data-tz>' + zones.map(function (z) {
      return '<option value="' + esc(z) + '"' + (z === S.tz ? ' selected' : '') + '>' + esc(X.zoneName(z)) + '</option>';
    }).join('') + '</select></label>';
  }

  function step2() {
    var cols = M.weekColumns(S.slots, S.monday, S.tz);
    var last = M.addDays(firstMonday, 7 * (MAX_WEEKS - 1));
    var grid = S.loading ? '<p class="lede" aria-busy="true">Loading open times…</p>'
      : '<div class="days">' + cols.map(function (d) {
        return '<div class="day"><h3><small>' + esc(d.dow) + '</small>' + esc(d.label) + '</h3>'
          + (d.slots.length ? d.slots.map(function (s) {
            return '<button type="button" class="slot" data-slot="' + esc(s.start) + '" aria-pressed="' + (s.start === S.slot) + '"'
              + ' aria-label="' + esc(d.dow + ' ' + d.label + ', ' + s.time) + '">' + esc(s.time) + '</button>';
          }).join('') : '<div class="none">No open times</div>') + '</div>';
      }).join('') + '</div>';
    return '<div class="week-head"><h2 tabindex="-1">Pick a time</h2><div class="week-nav">'
      + '<button type="button" class="btn btn-ghost btn-icon" data-week="-1" aria-label="Previous week"' + (S.monday <= firstMonday ? ' disabled' : '') + '>‹</button>'
      + '<span aria-live="polite">' + esc(M.weekLabel(S.monday)) + '</span>'
      + '<button type="button" class="btn btn-ghost btn-icon" data-week="1" aria-label="Next week"' + (S.monday >= last ? ' disabled' : '') + '>›</button></div></div>'
      + '<p class="lede">Times in your time zone, <b>' + esc(X.zoneName(S.tz)) + '</b>. Only times ' + esc(firstName()) + ' marked open are shown.</p>'
      + zoneSelect() + notice() + grid
      + '<div class="acts"><button type="button" class="btn btn-ghost" data-go="1">← Back</button>'
      + '<button type="button" class="btn btn-primary" data-go="3"' + (S.slot ? '' : ' disabled') + '>Add your details →</button></div>';
  }

  var FIELDS = [
    { k: 'name', label: 'Your name', attrs: 'autocomplete="name" required maxlength="120"' },
    { k: 'email', label: 'Company email', attrs: 'type="email" autocomplete="email" required maxlength="254"' },
    { k: 'company', label: 'Company', attrs: 'autocomplete="organization" required maxlength="160"' },
    { k: 'role', label: 'Role you’re hiring for', attrs: 'required maxlength="120" placeholder="Forward Deployed Engineer"' },
  ];

  function errFor(k) { return S.errors.filter(function (e) { return e.field === k; })[0]; }
  function field(f, extra) {
    var e = errFor(f.k);
    return '<div class="field"><label for="in-' + f.k + '">' + f.label + (extra || '') + '</label>'
      + (f.k === 'message'
        ? '<textarea id="in-message" name="message" rows="4" maxlength="2000" placeholder="The problem, the stack, the timeline">' + esc(S.fields.message || '') + '</textarea>'
        : '<input id="in-' + f.k + '" name="' + f.k + '" ' + f.attrs + ' value="' + esc(S.fields[f.k] || '') + '"'
          + (e ? ' aria-invalid="true" aria-describedby="err-' + f.k + '"' : '') + '>')
      + (e ? '<span class="err" id="err-' + f.k + '">' + esc(e.message) + '</span>' : '') + '</div>';
  }

  function step3() {
    return '<h2 tabindex="-1">Your details</h2><p class="lede">Shared with ' + esc(firstName()) + ' and the Colaberry team. Their contact details stay private, and so do yours until you both want to continue.</p>'
      + notice()
      + '<form id="details" method="post" action="' + esc(api) + '/api/public/hire/interviews" novalidate>'
      + '<input type="hidden" name="talentSlug" value="' + esc(slug) + '"><input type="hidden" name="format" value="' + esc(S.format) + '">'
      + '<input type="hidden" name="startsAt" value="' + esc(S.slot) + '">'
      + (S.format === 'walkthrough' ? '<input type="hidden" name="caseStudySlug" value="' + esc(S.caseSlug) + '">' : '')
      + (S.errors.length ? '<p class="err-sum" role="alert">' + esc(S.errors.length === 1 ? S.errors[0].message : 'Please fix the ' + S.errors.length + ' fields marked below.') + '</p>' : '')
      + '<div class="form-grid">' + FIELDS.map(function (x) { return field(x); }).join('') + '</div>'
      + field({ k: 'message', label: 'What would they walk into?' })
      + field({ k: 'interviewers', label: 'Invite other interviewers', attrs: 'autocomplete="off" maxlength="1300" placeholder="name@company.com, name@company.com"' }, ' <span class="muted">(optional, up to 5, separated by commas)</span>')
      + '<label class="check"><input type="checkbox" name="record"' + (S.fields.record ? ' checked' : '') + '> Record the session for my team (the candidate is asked to consent)</label>'
      + '<div class="acts"><button type="button" class="btn btn-ghost" data-go="2">← Back</button>'
      + '<button type="submit" class="btn btn-primary"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Sending…' : 'Send interview request') + '</button></div>'
      + '</form>';
  }

  function step4() {
    var p = S.slot ? X.slotParts(S.slot, S.tz) : null;
    var f = formatOf(S.format);
    var hold = p && f && S.person ? 'data:text/calendar;charset=utf-8,' + encodeURIComponent(M.holdIcs({
      start: S.slot, minutes: f.minutes, name: S.person.name, formatName: f.name, slug: slug,
    })) : '';
    var name = firstName();
    return '<div class="done-head"><span class="success-ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>'
      + '<div><h2 tabindex="-1">' + (S.confirmed ? 'You’re booked' : 'Request sent') + '</h2><p class="lede" style="margin:0">'
      + (S.confirmed ? esc(name) + ' takes bookings straight in. The calendar invite with your room link is on its way.'
        : esc(name) + ' gets it now and confirms within 24 hours. The time is held for you until then.') + '</p></div></div>'
      + '<ol class="timeline">'
      + '<li class="ok"><i aria-hidden="true">✓</i>Request sent<em>now</em></li>'
      + '<li class="' + (S.confirmed ? 'ok' : 'now') + '"><i aria-hidden="true">' + (S.confirmed ? '✓' : '2') + '</i>' + esc(name) + ' confirms, the Colaberry team is copied<em>' + (S.confirmed ? 'done' : 'within 24h') + '</em></li>'
      + '<li><i aria-hidden="true">3</i>Calendar invite with your room link<em>on confirm</em></li>'
      + '<li><i aria-hidden="true">4</i>Join the room in the browser<em>' + esc(p ? p.date + ', ' + p.time : 'at your time') + '</em></li></ol>'
      + '<div class="acts start">'
      + (hold ? '<a class="btn btn-primary" href="' + esc(hold) + '" download="interview-hold.ics">Add to my calendar</a>' : '')
      + '<a class="btn btn-ghost" href="/talent/' + encodeURIComponent(slug) + '/">Back to profile</a>'
      + '<button type="button" class="btn btn-text" data-reset>Book another</button></div>';
  }

  function render(focus) {
    $('steps').hidden = false;
    renderSteps();
    renderSummary();
    panel.innerHTML = [step1, step2, step3, step4][S.step - 1]();
    if (focus) {
      var target = S.step === 3 && S.errors.length ? $('in-' + S.errors[0].field) : panel.querySelector('h2');
      if (target) target.focus();
    }
  }

  function go(step) {
    S.step = step;
    S.notice = '';
    if (step === 2) loadSlots(); else render(true);
  }

  // ── data ──────────────────────────────────────────────────────────────────
  function loadSlots() {
    S.loading = true;
    render(true);
    var url = api + '/api/public/hire/talent/' + encodeURIComponent(slug) + '/slots?' + new URLSearchParams({ tz: S.tz, from: S.monday, format: S.format }).toString();
    // Only the latest request may render: a slow answer for last week must not overwrite this one.
    var seq = (S.seq = (S.seq || 0) + 1);
    C.fetchJson(url, 10000).then(function (res) {
      if (seq !== S.seq) return;
      S.loading = false;
      S.slots = res.ok && res.body && Array.isArray(res.body.slots) ? res.body.slots : [];
      if (!res.ok) S.notice = 'Open times could not be loaded just now. Please try again in a moment.';
      if (S.slot && !S.slots.some(function (s) { return s.start === S.slot; })) S.slot = null;
      render(false);
    });
  }

  function submit(form) {
    var fields = {};
    ['name', 'email', 'company', 'role', 'message', 'interviewers'].forEach(function (k) {
      fields[k] = String((form.elements[k] && form.elements[k].value) || '').trim();
    });
    fields.record = !!(form.elements.record && form.elements.record.checked);
    S.fields = fields;
    S.errors = M.validateDetails(fields);
    S.notice = '';
    if (S.errors.length) { render(true); return; }
    if (S.busy) return;
    S.busy = true;
    render(false);
    var body = {
      talentSlug: slug, format: S.format, startsAt: S.slot, name: fields.name, email: fields.email, company: fields.company,
      role: fields.role, message: fields.message, interviewers: M.interviewerList(fields.interviewers), record: fields.record,
    };
    if (S.format === 'walkthrough') body.caseStudySlug = S.caseSlug;
    post('/api/public/hire/interviews', body).then(function (r) {
      S.busy = false;
      if (r.status === 200 || r.status === 201) {
        S.confirmed = !!(r.body && r.body.confirmed);
        C.track(window, 'schedule_submit', { talentSlug: slug, format: S.format, ok: true });
        go(4);
        return;
      }
      C.track(window, 'schedule_submit', { talentSlug: slug, format: S.format, ok: false });
      if (r.status === 409) { S.slot = null; S.step = 2; S.notice = M.errorText('unavailable'); loadSlots(); return; }
      S.notice = r.status === 429 ? 'Too many requests from here just now. Please try again later.' : M.errorText(r.status === 400 ? 'invalid' : 'failed');
      render(true);
    });
  }

  function post(path, body) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    return fetch(api + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) { return { status: res.status, body: b }; });
    }, function () { return { status: 0, body: null }; }).then(function (r) { if (timer) clearTimeout(timer); return r; });
  }

  // ── a suggested time (?accept=) ───────────────────────────────────────────
  function acceptView(state, view) {
    $('steps').hidden = true;
    var p = view ? X.slotParts(view.startsAt, S.tz) : null;
    var f = view ? formatOf(view.format) || { name: 'Interview', minutes: view.minutes } : null;
    if (state === 'invalid') panel.innerHTML = '<h2 tabindex="-1">This link isn’t valid</h2><p class="lede">It may be mistyped, or the time has changed since it was sent. You can pick an open time instead.</p><div class="acts start"><a class="btn btn-primary" href="./">See open times</a></div>';
    else if (state === 'gone') panel.innerHTML = '<h2 tabindex="-1">That time is no longer on offer</h2><p class="lede">It has passed or been changed. Pick another open time, or reply to the email and the Colaberry team will help.</p><div class="acts start"><a class="btn btn-primary" href="./">See open times</a></div>';
    else if (state === 'done') panel.innerHTML = '<div class="done-head"><span class="success-ico" aria-hidden="true">✓</span><div><h2 tabindex="-1">Confirmed</h2><p class="lede" style="margin:0">You and ' + esc(firstName()) + ' both get the calendar invite with the room link shortly.</p></div></div><div class="acts start"><a class="btn btn-ghost" href="/talent/' + encodeURIComponent(slug) + '/">Back to profile</a></div>';
    else panel.innerHTML = '<h2 tabindex="-1">' + esc(firstName()) + ' suggested a new time</h2>'
      + '<p class="lede">In your time zone, ' + esc(X.zoneName(S.tz)) + '.</p>'
      + '<dl class="proposal"><dt>When</dt><dd>' + esc(p ? p.date + ' · ' + p.time : '') + '</dd><dt>Format</dt><dd>' + esc(f.name + ', ' + view.minutes + ' min') + '</dd><dt>Where</dt><dd>Refactored room</dd></dl>'
      + notice()
      + '<div class="acts start"><button type="button" class="btn btn-primary" data-accept' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Confirming…' : 'Confirm this time') + '</button>'
      + '<a class="btn btn-ghost" href="./">Pick a different time</a></div>';
    var h = panel.querySelector('h2'); if (h && state !== 'open') h.focus();
  }

  function runAccept() {
    C.fetchJson(api + '/api/public/hire/interviews/' + query.accept.id + '/proposal?t=' + query.accept.t, 10000).then(function (r) {
      if (r.status === 409) { acceptView('gone'); return; }
      if (!r.ok || !r.body) { acceptView('invalid'); return; }
      if (r.body.status === 'already') { acceptView('done'); return; }
      S.proposal = r.body;
      acceptView('open', r.body);
    });
  }

  // ── events ────────────────────────────────────────────────────────────────
  panel.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-format')) { S.format = b.getAttribute('data-format'); if (S.format !== 'walkthrough') S.caseSlug = null; S.slot = null; render(false); }
    else if (b.hasAttribute('data-case')) { S.caseSlug = b.getAttribute('data-case'); render(false); }
    else if (b.hasAttribute('data-week')) { S.monday = M.addDays(S.monday, 7 * Number(b.getAttribute('data-week'))); loadSlots(); }
    else if (b.hasAttribute('data-slot')) { S.slot = b.getAttribute('data-slot'); render(false); panel.querySelector('[data-slot="' + S.slot + '"]').focus(); }
    else if (b.hasAttribute('data-go')) { var g = Number(b.getAttribute('data-go')); if (g === 3 && !S.slot) return; go(g); }
    else if (b.hasAttribute('data-reset')) { S.step = 1; S.slot = null; S.confirmed = false; S.errors = []; S.fields = {}; go(1); }
    else if (b.hasAttribute('data-accept')) {
      S.busy = true; acceptView('open', S.proposal);
      post('/api/public/hire/interviews/' + query.accept.id + '/accept', { t: query.accept.t }).then(function (r) {
        S.busy = false;
        if (r.status === 200) acceptView('done');
        else if (r.status === 409) acceptView('gone');
        else if (r.status === 404) acceptView('invalid');
        else { S.notice = M.errorText('failed'); acceptView('open', S.proposal); }
      });
    }
  });
  panel.addEventListener('change', function (e) {
    if (e.target.matches && e.target.matches('[data-tz]') && X.isZone(e.target.value)) { S.tz = e.target.value; loadSlots(); }
  });
  panel.addEventListener('submit', function (e) {
    if (e.target.id !== 'details') return;
    e.preventDefault();
    submit(e.target);
  });

  // ── boot ──────────────────────────────────────────────────────────────────
  function unavailable(message) {
    $('steps').hidden = true;
    panel.innerHTML = '<h2 tabindex="-1">' + esc(message) + '</h2><p class="lede">You can still ask the Colaberry team for an introduction.</p>'
      + '<div class="acts start"><a class="btn btn-primary" href="/intro/?talent=' + encodeURIComponent(slug || '') + '">Request intro</a>'
      + (slug ? '<a class="btn btn-ghost" href="/talent/' + encodeURIComponent(slug) + '/">Back to profile</a>' : '') + '</div>';
  }

  function boot() {
    if (!slug) { unavailable('This page isn’t available'); return; }
    $('back').setAttribute('href', '/talent/' + encodeURIComponent(slug) + '/');
    C.fetchJson(api + '/api/public/portfolios/' + encodeURIComponent(slug) + '?surface=hire', 10000).then(function (res) {
      var b = res.body;
      if (!res.ok || !b || !b.ok || !b.portfolio || !b.hire) { unavailable('This profile isn’t listed'); return; }
      var id = b.portfolio.identity || {};
      S.person = { name: id.full_name || 'This candidate', headline: id.headline || '', avatarUrl: id.avatar_data_url };
      doc.title = 'Schedule an interview with ' + S.person.name + ' · Hire · Refactored.ai';
      var booking = b.hire.booking || {};
      S.cases = (Array.isArray(b.hire.caseStudies) ? b.hire.caseStudies : []).filter(function (c) { return c && c.slug && c.title; });
      S.formats = (Array.isArray(booking.formats) ? booking.formats : [])
        .filter(function (f) { return f && f.id && (f.id !== 'walkthrough' || S.cases.length); });
      renderSummary();
      if (query.accept) { runAccept(); return; }
      if (query.sent) { S.step = 4; render(true); return; }
      if (!booking.enabled || !S.formats.length) { unavailable(S.person.name + ' isn’t taking bookings right now'); return; }
      S.format = S.formats.length === 1 ? S.formats[0].id : null;
      if (query.slot) {
        S.format = shortest().id;
        S.slot = query.slot;
        var p = X.slotParts(query.slot, S.tz);
        if (p && p.day >= today) S.monday = M.mondayOf(p.day);
        go(2);
        return;
      }
      if (query.error) S.notice = M.errorText(query.error);
      render(false);
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
