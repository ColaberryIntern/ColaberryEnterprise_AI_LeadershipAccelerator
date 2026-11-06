/*
 * hire.refactored.ai - page glue shared by every view: theme toggle, toast, shortlist,
 * smooth section scroll. Browser-only; the pure helpers it uses live in common.js.
 *
 * Theme follows the token file's three-state model: no choice = the OS preference; an
 * explicit choice stamps `data-theme` on <html> and is remembered per viewer.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var doc = document;
  var THEME_KEY = 'hr-theme';

  function storage() { try { return window.localStorage; } catch (e) { return null; } }

  /* Applied as early as this script runs, so a remembered theme does not flash. */
  (function applyTheme() {
    var s = storage();
    var saved = null;
    try { saved = s && s.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (saved === 'light' || saved === 'dark') doc.documentElement.setAttribute('data-theme', saved);
  }());

  var toastTimer = null;
  function toast(message) {
    var el = doc.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer); // a second toast resets the timer rather than stacking
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function shortlist() { var s = storage(); return s ? C.readShortlist(s) : []; }
  function renderShortCount(list) {
    var el = doc.getElementById('shortCount');
    if (el) el.textContent = String(list.length);
  }

  function syncStars(slug, on) {
    doc.querySelectorAll('[data-star="' + CSS.escape(slug) + '"]').forEach(function (b) {
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      if (b.classList.contains('btn')) b.textContent = on ? '★ Shortlisted' : '★ Shortlist';
    });
  }

  function onClick(e) {
    var star = e.target.closest('[data-star]');
    if (star) {
      e.preventDefault();
      var slug = star.getAttribute('data-star');
      var name = star.getAttribute('data-name') || 'Engineer';
      var next = C.toggleShortlist(shortlist(), slug);
      var s = storage();
      if (s) C.writeShortlist(s, next);
      var on = next.indexOf(slug) >= 0;
      syncStars(slug, on);
      renderShortCount(next);
      toast(on ? '★ ' + name + ' added to your shortlist' : 'Removed from shortlist');
      C.track(window, 'shortlist_toggle', { talentSlug: slug, on: on });
      return;
    }
    var sc = e.target.closest('[data-scroll]');
    if (sc) {
      var target = doc.getElementById(sc.getAttribute('data-scroll'));
      if (target) {
        e.preventDefault();
        // Under reduced motion the browser default (an instant jump) is the right answer.
        target.scrollIntoView({ behavior: C.reducedMotion(window) ? 'auto' : 'smooth' });
      }
    }
  }

  function initThemeButton() {
    var btn = doc.getElementById('themeBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var root = doc.documentElement;
      var current = root.getAttribute('data-theme')
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      var s = storage();
      try { if (s) s.setItem(THEME_KEY, next); } catch (err) { /* per-viewer convenience only */ }
    });
  }

  function initShortButton() {
    var btn = doc.getElementById('shortBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var list = shortlist();
      toast(list.length ? '★ ' + list.length + ' on your shortlist' : 'Star engineers to build a shortlist');
    });
  }

  window.HirePage = { toast: toast, shortlist: shortlist, renderShortCount: renderShortCount };
  doc.addEventListener('click', onClick);
  doc.addEventListener('DOMContentLoaded', function () {
    initThemeButton();
    initShortButton();
    renderShortCount(shortlist());
  });
}());
