/*
 * Colaberry landing-page snack bar ("someone just signed up").
 *
 * Loaded by every hosted landing page whose snack bar is on, as:
 *   <script src="/v1/snackbar.js" data-feed="/v1/lp-activity/<brand>/<slug>"
 *           data-interval="8" data-delay="3" defer></script>
 *
 * WHY A FILE AND NOT INLINE. The landing-page CSP is `script-src 'self'` with no
 * inline script, on purpose (operator-supplied copy is rendered on that page).
 * A same-origin file is the only way in that does not weaken that policy.
 *
 * THE SERVER DECIDES WHAT IS SAID. The feed returns finished, already-anonymised
 * strings. This script never sees an email, a surname or a lead id, so nothing it
 * does (or a bug in it) can leak one. Everything is written with textContent.
 *
 * NO FEED, NO BAR. If the feed fails, times out or is empty, nothing is shown.
 * There are no built-in sample events: an empty page is honest, a seeded one is not.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var feedUrl = script.getAttribute('data-feed');
  var intervalMs = clampSeconds(script.getAttribute('data-interval'), 8, 4, 120) * 1000;
  var delayMs = clampSeconds(script.getAttribute('data-delay'), 3, 0, 60) * 1000;
  var DISMISS_KEY = 'cb.snackbar.dismissed:' + location.pathname;
  var FETCH_TIMEOUT_MS = 5000;

  if (!feedUrl || isDismissed()) return;

  function clampSeconds(raw, fallback, min, max) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function isDismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function rememberDismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* storage off: dismiss lasts this view only */ }
  }

  function agoText(minutes) {
    if (typeof minutes !== 'number' || minutes < 0) return '';
    if (minutes < 2) return 'just now';
    if (minutes < 60) return minutes + ' min ago';
    var h = Math.round(minutes / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgIcon(pathD) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', pathD);
    svg.appendChild(p);
    return svg;
  }

  function isValidEvent(e) {
    return e && typeof e.title === 'string' && e.title.length > 0 && e.title.length <= 120 &&
      (e.action == null || (typeof e.action === 'string' && e.action.length <= 160));
  }

  function start(events) {
    events = (events || []).filter(isValidEvent).slice(0, 20);
    if (!events.length) return;

    var root = el('div', 'cb-snack');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    var avatar = el('span', 'cb-snack__avatar');
    avatar.setAttribute('aria-hidden', 'true');
    var body = el('div', 'cb-snack__body');
    var title = el('span', 'cb-snack__title');
    var action = el('span', 'cb-snack__action');
    var meta = el('span', 'cb-snack__meta');
    var dot = el('span', 'cb-snack__dot');
    var metaText = el('span');
    meta.appendChild(dot);
    meta.appendChild(metaText);
    body.appendChild(title);
    body.appendChild(action);
    body.appendChild(meta);
    var close = el('button', 'cb-snack__close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss notifications');
    close.appendChild(svgIcon('M6 6l12 12M18 6L6 18'));
    root.appendChild(avatar);
    root.appendChild(body);
    root.appendChild(close);
    document.body.appendChild(root);

    var i = 0;
    var timer = null;
    var stopped = false;

    function paint(e) {
      avatar.textContent = (e.initials || '').slice(0, 3);
      avatar.setAttribute('data-kind', e.kind || 'signup');
      title.textContent = e.title;
      action.textContent = e.action || '';
      var label = e.kind === 'daily_count' ? 'Live from the learning portal'
        : e.kind === 'module_started' ? 'Verified learner' : 'Verified signup';
      var ago = agoText(e.ago_minutes);
      metaText.textContent = ago ? label + ' · ' + ago : label;
    }

    function show() { root.classList.add('is-visible'); }
    function hide() { root.classList.remove('is-visible'); }

    function cycle() {
      if (stopped) return;
      hide();
      timer = setTimeout(function () {
        if (stopped) return;
        i = (i + 1) % events.length;
        paint(events[i]);
        show();
        timer = setTimeout(cycle, intervalMs);
      }, 450);
    }

    close.addEventListener('click', function () {
      stopped = true;
      clearTimeout(timer);
      hide();
      rememberDismiss();
      setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); }, 500);
    });

    // Do not burn through events in a background tab.
    document.addEventListener('visibilitychange', function () {
      if (stopped) return;
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(cycle, intervalMs);
    });

    paint(events[0]);
    timer = setTimeout(function () {
      show();
      if (events.length > 1) timer = setTimeout(cycle, intervalMs);
    }, delayMs);
  }

  // Local preview hook: the preview HTML in this kit sets window.CB_SNACKBAR_DEMO.
  // Production pages never define it (and their CSP forbids the inline script that would).
  if (window.CB_SNACKBAR_DEMO && Array.isArray(window.CB_SNACKBAR_DEMO)) {
    start(window.CB_SNACKBAR_DEMO);
    return;
  }

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var abortTimer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;
  fetch(feedUrl, { credentials: 'omit', signal: controller ? controller.signal : undefined, headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : { events: [] }; })
    .then(function (data) { clearTimeout(abortTimer); start(data && data.events); })
    .catch(function () { clearTimeout(abortTimer); /* no feed, no bar */ });
})();
