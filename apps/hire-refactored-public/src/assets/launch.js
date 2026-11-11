/*
 * hire.refactored.ai - the two signature moments (MOTION.md §5 and §6).
 *
 * THE LAUNCH: clicking a published case-study link flexes the card and sweeps gold across
 * it while the browser opens the case study in a new tab ON THE SAME CLICK. This file
 * never calls preventDefault and never calls window.open: the anchor's own
 * target=_blank does the opening, so popup blockers, middle-click and cmd-click all work.
 *
 * THE BOOT SEQUENCE: on /case-studies/<slug>/ a terminal "verifies" the record before it
 * reveals. EVERY LINE IS BOUND TO REAL DATA; a field that is missing omits its line, and
 * no check mark is ever printed for something unverified. The API request is already in
 * flight (case-study-page.js) when the overlay mounts.
 */
(function (root, factory) {
  var common = typeof module === 'object' && module.exports ? require('./common.js') : root.HireCommon;
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireLaunch = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var esc = C.esc;
  var FIRST_GAP = 380; var GAP = 210; var HOLD = 450; var FADE = 500; var REMOVE = 520; var CAP = 4000;

  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; }

  /* The lines, from the payload. Optional evidence (commit counts) arrives on the hire
     detail's `hireEvidence`; without it those two lines simply do not exist. */
  function bootLines(slug, body) {
    var lines = ['<span class="a">$</span> refactored open --case ' + esc(slug)];
    var c = body && body.caseStudy;
    if (!c) return lines;
    if (c.builder && c.builder.name) lines.push('  resolving builder ……… <span class="g">' + esc(c.builder.name) + '</span>');
    if (Array.isArray(c.repositories) && c.repositories.length) lines.push('  repository ………………… <span class="g">public ✓</span>');
    var ev = body.hireEvidence || {};
    var commits = num(ev.verifiedCommits);
    if (commits !== null && commits > 0) lines.push('  commits verified …… <span class="g">' + commits + ' / ' + commits + ' ✓</span>');
    var crit = num(ev.criteriaPassed);
    if (crit !== null && crit > 0) lines.push('  acceptance criteria  <span class="g">' + crit + ' passed ✓</span>');
    lines.push('  case study ………………… <span class="y">★ published</span>');
    lines.push('');
    lines.push('<span class="y">→ opening case study</span>');
    return lines;
  }

  /* When each line prints (ms from mount): 0, +380, then +210 each; hold 450; fade 500;
     remove at +520 after the fade starts. */
  function bootSchedule(lineCount) {
    var at = [];
    for (var i = 0; i < lineCount; i += 1) at.push(i === 0 ? 0 : FIRST_GAP + (i - 1) * GAP);
    var last = at.length ? at[at.length - 1] : 0;
    return { lines: at, fadeAt: last + HOLD, removeAt: last + HOLD + REMOVE, fadeMs: FADE };
  }

  var LAUNCH_FROM = ['signature', 'project', 'strip', 'case-list'];

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { bootLines: bootLines, bootSchedule: bootSchedule, CAP: CAP, LAUNCH_FROM: LAUNCH_FROM };
  }

  var doc = document;

  /* ------------------------------------------------------------- launch --- */
  doc.addEventListener('click', function (e) {
    var l = e.target.closest && e.target.closest('[data-launch]');
    if (!l) return;
    if (!C.reducedMotion(window)) {
      l.classList.remove('launch');
      void l.offsetWidth; // force a reflow so ten fast clicks replay ten times, not stack
      l.classList.add('launch');
    }
    if (window.HirePage) window.HirePage.toast('★ Opening case study in a new tab…');
    var from = l.getAttribute('data-from');
    C.track(window, 'case_study_open', {
      slug: l.getAttribute('data-case'),
      from: LAUNCH_FROM.indexOf(from) >= 0 ? from : 'project',
      talentSlug: l.getAttribute('data-talent-slug'),
    });
  });
  doc.addEventListener('animationend', function (e) {
    if (e.target.classList && e.target.classList.contains('launch') && e.animationName === 'launch') e.target.classList.remove('launch');
  });

  /* --------------------------------------------------------------- boot --- */
  if (doc.body.getAttribute('data-view') !== 'case-study' || !window.HireCaseStudyRequest) {
    return { bootLines: bootLines, bootSchedule: bootSchedule, CAP: CAP, LAUNCH_FROM: LAUNCH_FROM };
  }

  var slug = window.HireCaseStudy.slugFromPath(window.location.pathname);
  var seenKey = 'hr-boot:' + slug;
  var seen = false;
  try { seen = window.sessionStorage.getItem(seenKey) === '1'; } catch (err) { seen = false; }
  // Reduced motion never mounts the overlay; a second visit in a session goes straight in.
  if (!slug || seen || C.reducedMotion(window)) {
    return { bootLines: bootLines, bootSchedule: bootSchedule, CAP: CAP, LAUNCH_FROM: LAUNCH_FROM };
  }

  var overlay = doc.createElement('div');
  overlay.className = 'boot';
  overlay.setAttribute('aria-hidden', 'true'); // screen readers get the content, not the terminal
  overlay.innerHTML = '<div class="term"><div class="tb"><i></i><i></i><i></i></div><pre></pre></div>';
  doc.body.appendChild(overlay);
  var tty = overlay.querySelector('pre');
  var closed = false;
  var timers = [];
  var mountedAt = Date.now();

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function close() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    try { window.sessionStorage.setItem(seenKey, '1'); } catch (err) { /* once-per-session is a convenience */ }
    overlay.classList.add('out');
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      var h1 = doc.getElementById('cs-title');
      if (h1) h1.focus({ preventScroll: true });
    }, REMOVE);
  }
  function print(html) { tty.innerHTML += html + '\n'; }

  overlay.addEventListener('click', close);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  print(bootLines(slug, null)[0]); // the first line needs no data: t = 0

  var cursor = null;
  var settled = false;
  // The cap: if the data has not arrived 4s after mount, stop waiting.
  later(function () { if (!settled) finish(false); }, CAP);

  window.HireCaseStudyRequest.then(function (res) {
    var ok = !!(res && res.ok && window.HireCaseStudy.isPayload(res.body));
    if (!settled) finish(ok, ok ? res.body : null);
  });

  function finish(ok, body) {
    settled = true;
    if (closed) return;
    // Before any print: `innerHTML +=` re-parses the terminal and would orphan the cursor.
    if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
    cursor = null;
    if (!ok) {
      print('<span class="w">→ case study not available</span>');
      later(close, HOLD);
      return;
    }
    var lines = bootLines(slug, body);
    var plan = bootSchedule(lines.length);
    var elapsed = Date.now() - mountedAt;
    lines.slice(1).forEach(function (line, i) {
      later(function () { print(line); }, Math.max(0, plan.lines[i + 1] - elapsed));
    });
    later(close, Math.max(0, plan.fadeAt - elapsed));
  }

  // Data still pending after the second line's slot: hold on a blinking cursor.
  later(function () {
    if (settled || closed) return;
    cursor = doc.createElement('span');
    cursor.className = 'cursor';
    cursor.textContent = '▍';
    tty.appendChild(cursor);
  }, FIRST_GAP);

  return { bootLines: bootLines, bootSchedule: bootSchedule, CAP: CAP, LAUNCH_FROM: LAUNCH_FROM, close: close };
}));
