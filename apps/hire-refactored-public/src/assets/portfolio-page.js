/*
 * hire.refactored.ai - portfolio boot. Reads the slug from the path, fetches the hire
 * portfolio, and upgrades the "This profile isn't listed" state that ships in the HTML.
 * A 404, a 500, a timeout or a malformed body all leave that state exactly as it is.
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var P = window.HirePortfolio;
  var doc = document;
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var slug = P.slugFromPath(window.location.pathname);

  function load() {
    if (!slug) return;
    C.fetchJson(api + '/api/public/portfolios/' + encodeURIComponent(slug) + '?surface=hire', 10000).then(function (res) {
      if (!res.ok || !P.isPayload(res.body)) return;
      var body = res.body;
      doc.getElementById('main').innerHTML = P.renderPortfolio(body, slug, window.HirePage.shortlist(), new Date(), api);
      doc.title = body.portfolio.identity.full_name + ' · Hire · Refactored.ai';
      // Indexable only on an explicit public opt-in; unlisted pages stay noindex.
      if (body.hire.indexable === true) {
        var robots = doc.getElementById('robots');
        if (robots) robots.setAttribute('content', 'index, follow');
      }
      doc.dispatchEvent(new CustomEvent('hire:portfolio-rendered', { detail: body }));
    });
  }

  doc.addEventListener('click', function (e) {
    if (e.target.closest('[data-copy]')) {
      var done = function () { window.HirePage.toast('✓ Profile link copied'); };
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(window.location.href).then(done, done);
        else done();
      } catch (err) { done(); }
    }
    if (e.target.closest('[data-intro]')) C.track(window, 'intro_start', { talentSlug: slug });
    if (e.target.closest('[data-book]')) C.track(window, 'schedule_start', { talentSlug: slug });
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', load);
  else load();
}());
