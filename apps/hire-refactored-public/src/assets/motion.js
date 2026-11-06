/*
 * hire.refactored.ai - JS-driven ambient motion: the ledger count-up (MOTION.md §3.1) and
 * pausing the living art while it is off screen (§7). Timing functions are pure and
 * exported for node's test runner.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireMotion = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var COUNT_MS = 600;

  /* Ease-out cubic over ELAPSED time, so the count lands in 600ms whatever the frame rate. */
  function countUpValue(elapsedMs, target) {
    var to = Math.max(0, Math.floor(Number(target) || 0));
    if (to === 0) return 0;
    var t = Math.min(1, Math.max(0, elapsedMs / COUNT_MS));
    if (t >= 1) return to;
    return Math.round(to * (1 - Math.pow(1 - t, 3)));
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { countUpValue: countUpValue, COUNT_MS: COUNT_MS };
  }

  var C = window.HireCommon;

  function countUp(scope) {
    var els = Array.prototype.slice.call(scope.querySelectorAll('[data-count]'));
    var reduce = C.reducedMotion(window);
    els.forEach(function (el) {
      var to = Number(el.getAttribute('data-count')) || 0;
      if (reduce || to === 0) { el.textContent = String(to); return; }
      var start = null;
      el.textContent = '0';
      var tick = function (now) {
        if (start === null) start = now;
        var v = countUpValue(now - start, to);
        el.textContent = String(v);
        if (v < to) window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
  }

  /* Pause the evidence-path animation on art that is not on screen. With 48 cards on a
     page, only the visible ones spend CPU. */
  var io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var svg = e.target;
        if (typeof svg.pauseAnimations !== 'function') return;
        if (e.isIntersecting) svg.unpauseAnimations(); else svg.pauseAnimations();
      });
    }, { rootMargin: '100px' })
    : null;

  function watchArt(scope) {
    var svgs = scope.querySelectorAll('svg.hire-art');
    svgs.forEach(function (svg) {
      // Reduced motion: the dash never flows; the picture is shown at rest.
      if (C.reducedMotion(window) && typeof svg.pauseAnimations === 'function') { svg.pauseAnimations(); return; }
      if (io && !svg.__hireWatched) { svg.__hireWatched = true; io.observe(svg); }
    });
  }

  function onRendered() {
    countUp(document);
    watchArt(document);
  }

  ['hire:directory-rendered', 'hire:portfolio-rendered', 'hire:case-rendered'].forEach(function (ev) {
    document.addEventListener(ev, function () { window.requestAnimationFrame(onRendered); });
  });

  return { countUpValue: countUpValue, COUNT_MS: COUNT_MS, countUp: countUp, watchArt: watchArt };
}));
