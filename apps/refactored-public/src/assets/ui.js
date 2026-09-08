/*
 * Refactored.ai page behaviour. No framework, no dependencies.
 *
 * Two jobs: turn the role sections into ARIA tabs, and emit the explicit CTA events the
 * tracking plan asks for. Everything here is an ENHANCEMENT — the markup it operates on
 * is complete and readable without it, which is why the tablist ships `hidden` and is
 * revealed by this file rather than the reverse. A component that hides content before
 * its script runs hides that content permanently when the script fails to load.
 */
(function () {
  'use strict';

  /* --- Role tabs --------------------------------------------------------- */
  function initTabs(list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;

    var panels = tabs
      .map(function (tab) { return document.getElementById(tab.getAttribute('aria-controls')); })
      .filter(Boolean);
    if (panels.length !== tabs.length) return; // markup and script disagree: leave it open

    // Only now is it safe to hide anything, because the script is demonstrably running
    // and every panel has a control that can bring it back.
    list.hidden = false;
    panels.forEach(function (panel) { panel.hidden = true; });

    function select(index, moveFocus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        // Roving tabindex: one stop for the whole group, arrows move within it.
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (moveFocus) tabs[index].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (event) {
        var last = tabs.length - 1;
        var next = null;
        if (event.key === 'ArrowRight') next = i === last ? 0 : i + 1;
        else if (event.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = last;
        if (next === null) return;
        event.preventDefault();
        select(next, true);
      });
    });

    select(0, false);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), initTabs);

  /* --- Explicit CTA events ----------------------------------------------- */
  /*
   * The tracker records pageviews on its own. These are the named interactions the
   * tracking plan calls for, sent with a stable event name and nothing else: no form
   * contents, no free text, no identifiers. Whatever a visitor types is theirs.
   */
  document.addEventListener('click', function (event) {
    var target = event.target.closest ? event.target.closest('[data-track]') : null;
    if (!target) return;

    var name = target.getAttribute('data-track');
    if (!name) return;

    var api = window.refactoredTrack || (window.track && window.track.event);
    try {
      if (typeof api === 'function') {
        api(name, { label: (target.textContent || '').trim().slice(0, 60) });
      }
    } catch (err) {
      // Tracking must never break a navigation. Swallowing here is deliberate and is
      // the one place in this codebase where an empty catch is correct: the user's click
      // has to proceed whether or not analytics is reachable.
      void err;
    }
  }, true);
})();
