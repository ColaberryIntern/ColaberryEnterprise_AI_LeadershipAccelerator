/*
 * hire.refactored.ai - case-study boot. Fetches the hire-surface record, draws the hire
 * frame (hero, outcomes, sticky hire card) and reveals the shipped-hidden frame the shared
 * renderer fills. Anything but a published record leaves the not-found state untouched.
 *
 * The request is exposed as `window.HireCaseStudyRequest` so the boot sequence (launch.js)
 * can start in parallel with it rather than after it (MOTION.md §6).
 */
(function () {
  'use strict';
  var C = window.HireCommon;
  var S = window.HireCaseStudy;
  var doc = document;
  var api = (doc.body.getAttribute('data-api') || '').replace(/\/+$/, '');
  var slug = S.slugFromPath(window.location.pathname);

  var request = slug
    ? C.fetchJson(api + '/api/public/case-studies/' + encodeURIComponent(slug) + '?surface=hire', 10000)
    : Promise.resolve({ ok: false, status: 404, body: null });
  window.HireCaseStudyRequest = request;

  /* A role-only record linked to a listed person: draw at once, then name the builder from
     their public portfolio when it answers. A slow or failed portfolio leaves the page as
     drawn - the record is never held for it. */
  function upgradeBuilder(body) {
    if (S.builderOf(body) || typeof body.builderPortfolioSlug !== 'string') return;
    C.fetchJson(api + '/api/public/portfolios/' + encodeURIComponent(body.builderPortfolioSlug) + '?surface=hire', 10000)
      .then(function (res) {
        var person = S.personFromPortfolio(res);
        if (!person) return;
        doc.getElementById('hire-hero-host').innerHTML = S.hero(body, person);
        doc.getElementById('hire-card-host').innerHTML = S.hireCard(body, person);
      });
  }

  function render(res) {
    if (!res.ok || !S.isPayload(res.body)) return false;
    var body = res.body;
    doc.getElementById('hire-hero-host').innerHTML = S.hero(body);
    doc.getElementById('outcomes-host').innerHTML = S.outcomes(body);
    doc.getElementById('hire-card-host').innerHTML = S.hireCard(body);
    upgradeBuilder(body);
    doc.getElementById('case-missing').hidden = true;
    doc.getElementById('case-frame').hidden = false;
    var robots = doc.getElementById('robots');
    if (robots) robots.setAttribute('content', 'index, follow'); // a published record is a real page
    var who = S.builderOf(body);
    doc.title = body.caseStudy.title + ' · Hire · Refactored.ai';
    doc.dispatchEvent(new CustomEvent('hire:case-rendered', { detail: { body: body, builder: who } }));
    return true;
  }

  function start() {
    request.then(function (res) {
      var ok = render(res);
      doc.dispatchEvent(new CustomEvent('hire:case-resolved', { detail: { ok: ok, body: ok ? res.body : null } }));
    });
  }

  doc.addEventListener('click', function (e) {
    var intro = e.target.closest('[data-intro]');
    if (intro) C.track(window, 'intro_start', { talentSlug: intro.getAttribute('data-intro'), caseSlug: slug });
  });

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
}());
