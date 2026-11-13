/*
 * hire.refactored.ai - directory boot: fetch, upgrade the page, wire the filters.
 *
 * Filters are SERVER-side (the API owns the gate and the search), so a change re-fetches.
 * The search box is debounced; every request carries the URL's own query string, which is
 * kept in sync with history.replaceState so the view can be shared as a link.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var D = window.HireDirectory;
  var doc = document;
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var filters = D.parseFilters(window.location.search);
  var seq = 0;
  var debounce = null;

  function endpoint(f) { return api + '/api/public/hire/talent' + D.filtersToQuery(f); }

  /* First load: replace the shipped loading placeholders with the real page. A failed or
     malformed answer says the directory could not be reached; it never claims nobody is listed. */
  function load() {
    C.fetchJson(endpoint(filters), 10000).then(function (res) {
      var main = doc.getElementById('main');
      if (!res.ok || !D.isPayload(res.body)) {
        if (main) main.innerHTML = D.renderUnavailable();
        return;
      }
      main.innerHTML = D.renderDirectory(res.body, filters, window.HirePage.shortlist(), api);
      wireFilters();
      doc.dispatchEvent(new CustomEvent('hire:directory-rendered', { detail: res.body }));
    });
  }

  /* A filter change: refetch, then swap ONLY the grid, so focus stays in the control. */
  function refresh() {
    var mine = ++seq;
    var url = D.filtersToQuery(filters);
    try { window.history.replaceState(null, '', window.location.pathname + url); } catch (e) { /* non-fatal */ }
    C.track(window, 'filter_change', { q: filters.q, track: filters.track, sort: filters.sort });
    C.fetchJson(endpoint(filters), 10000).then(function (res) {
      if (mine !== seq) return; // a newer request already answered
      var grid = doc.getElementById('grid');
      if (!grid) return;
      if (!res.ok || !D.isPayload(res.body)) {
        grid.innerHTML = '<div class="empty">The directory could not be reached just now. Try again in a moment.</div>';
        return;
      }
      grid.innerHTML = D.renderGrid(res.body.talent, window.HirePage.shortlist());
    });
  }

  function wireFilters() {
    var q = doc.getElementById('q');
    var sort = doc.getElementById('sort');
    if (q) {
      q.addEventListener('input', function () {
        filters.q = q.value.slice(0, 80);
        clearTimeout(debounce);
        debounce = setTimeout(refresh, 250);
      });
    }
    if (sort) sort.addEventListener('change', function () { filters.sort = sort.value; refresh(); });
    doc.querySelectorAll('[data-track]').forEach(function (b) {
      b.addEventListener('click', function () {
        filters.track = b.getAttribute('data-track');
        doc.querySelectorAll('[data-track]').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('on', on);
          x.setAttribute('aria-pressed', String(on));
        });
        refresh();
      });
    });
  }

  doc.addEventListener('click', function (e) {
    var card = e.target.closest('[data-talent]');
    if (card) C.track(window, 'talent_card_click', { talentSlug: card.getAttribute('data-talent') });
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', load);
  else load();
}());
