/*
 * hire.refactored.ai - the case-study carousel on a talent profile (`/talent/<slug>/`).
 *
 * portfolio.js renders the markup (`carousel()`); this file only runs it. It binds once the
 * profile is on the page (`hire:portfolio-rendered`, or immediately if it is already there).
 *
 * BEHAVIOUR (docs/hire-refactored/profile-upgrade-demo/PROMPT.md §1.2):
 *   - advances every 6s; pauses while hovered or while focus is inside; stops while the tab
 *     is hidden; the play/pause button toggles its label between "Pause" and "Play carousel";
 *   - left and right arrow keys move between slides when focus is inside;
 *   - a slide change resets the progress line and plays `.car-slide.enter`;
 *   - REDUCED MOTION: starts paused and never auto-advances. motion.css turns the animations
 *     off as well, so the slide simply swaps.
 * The progress line is drawn with transform: scaleX, never width (MOTION.md §0: no layout
 * property is animated). The pure timing below is exported for node's test runner.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireCarousel = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLIDE_MS = 6000;
  var TICK_MS = 100;

  /* Index after a step of `d` (+1 next, -1 previous), wrapping both ways. */
  function step(i, d, n) {
    if (!(n > 0)) return 0;
    return (((i + d) % n) + n) % n;
  }

  /* One tick of the clock: the new elapsed time, and whether it is time to advance. */
  function tick(elapsed, dt, running) {
    if (!running) return { elapsed: elapsed, advance: false };
    var t = elapsed + dt;
    return t >= SLIDE_MS ? { elapsed: 0, advance: true } : { elapsed: t, advance: false };
  }

  var pure = { SLIDE_MS: SLIDE_MS, TICK_MS: TICK_MS, step: step, tick: tick };
  if (typeof window === 'undefined' || typeof document === 'undefined') return pure;

  var doc = document;

  function bind(car) {
    if (!car || car.getAttribute('data-car-bound') === '1') return;
    car.setAttribute('data-car-bound', '1');
    var slides = Array.prototype.slice.call(car.querySelectorAll('.car-slide'));
    var n = slides.length;
    if (n < 2) return;
    var thumbs = car.nextElementSibling && car.nextElementSibling.hasAttribute('data-car-thumbs') ? car.nextElementSibling : null;
    var kicker = car.querySelector('[data-car-kicker]');
    var count = car.querySelector('[data-car-count]');
    var bar = car.querySelector('[data-car-bar]');
    var playBtn = car.querySelector('[data-car-play]');
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var state = { i: 0, elapsed: 0, playing: !reduce, hover: false, focus: false };
    var pad = function (v) { return (v < 10 ? '0' : '') + v; };

    function paint() {
      if (bar) bar.style.transform = 'scaleX(' + (state.playing ? state.elapsed / SLIDE_MS : 0) + ')';
    }

    function show(k) {
      var prev = state.i;
      state.i = step(k, 0, n);
      state.elapsed = 0;
      slides.forEach(function (s, j) {
        var on = j === state.i;
        s.hidden = !on;
        s.classList.toggle('on', on);
        if (!on) s.classList.remove('enter');
      });
      var cur = slides[state.i];
      if (prev !== state.i && !reduce) {
        cur.classList.remove('enter');
        void cur.offsetWidth; // restart the enter animation on every change
        cur.classList.add('enter');
      }
      if (kicker) kicker.textContent = cur.getAttribute('data-kicker') || '';
      if (count) count.textContent = pad(state.i + 1) + ' / ' + pad(n);
      if (thumbs) {
        Array.prototype.forEach.call(thumbs.querySelectorAll('[data-car-go]'), function (b, j) {
          b.setAttribute('aria-current', j === state.i ? 'true' : 'false');
        });
      }
      paint();
    }

    function setPlaying(v) {
      state.playing = v;
      state.elapsed = 0;
      if (playBtn) {
        playBtn.setAttribute('aria-label', v ? 'Pause carousel' : 'Play carousel');
        playBtn.classList.toggle('is-paused', !v);
      }
      paint();
    }

    var timer = window.setInterval(function () {
      if (!doc.body.contains(car)) { window.clearInterval(timer); return; }
      var running = state.playing && !state.hover && !state.focus && !doc.hidden;
      var r = tick(state.elapsed, TICK_MS, running);
      state.elapsed = r.elapsed;
      if (r.advance) show(state.i + 1); else if (running) paint();
    }, TICK_MS);

    car.addEventListener('mouseenter', function () { state.hover = true; });
    car.addEventListener('mouseleave', function () { state.hover = false; });
    car.addEventListener('focusin', function () { state.focus = true; });
    car.addEventListener('focusout', function (e) { if (!car.contains(e.relatedTarget)) state.focus = false; });
    car.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show(state.i + 1); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(state.i - 1); e.preventDefault(); }
    });
    car.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (!t) return;
      if (t.closest('[data-car-prev]')) show(state.i - 1);
      else if (t.closest('[data-car-next]')) show(state.i + 1);
      else if (t.closest('[data-car-play]')) setPlaying(!state.playing);
    });
    if (thumbs) {
      thumbs.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-car-go]');
        if (b) show(Number(b.getAttribute('data-car-go')) || 0);
      });
    }
    car.classList.add('is-live');
    setPlaying(state.playing);
    show(0);
  }

  function bindAll() { Array.prototype.forEach.call(doc.querySelectorAll('[data-car]'), bind); }
  doc.addEventListener('hire:portfolio-rendered', bindAll);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bindAll);
  else bindAll();

  return pure;
}));
