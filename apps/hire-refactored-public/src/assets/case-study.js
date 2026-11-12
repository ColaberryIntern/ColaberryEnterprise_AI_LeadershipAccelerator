/*
 * hire.refactored.ai - the person-first frame around a case study: the hire hero with
 * the "Built by" chip, the outcome tiles, and the sticky hire card. The record body itself
 * is drawn by the shared case-study-record.js (HIRE_ORDER, from the server).
 *
 * Reads GET /api/public/case-studies/:slug?surface=hire. Every value is the projection's:
 * the builder's name is already consent-resolved server-side, the outcome tiles are the
 * record's own published hero metrics, and a missing field renders nothing.
 */
(function (root, factory) {
  var common = typeof module === 'object' && module.exports ? require('./common.js') : root.HireCommon;
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireCaseStudy = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var esc = C.esc;
  var arr = function (v) { return Array.isArray(v) ? v : []; };

  function isPayload(body) {
    return !!(body && body.caseStudy && typeof body.caseStudy.slug === 'string' && typeof body.caseStudy.title === 'string');
  }

  function slugFromPath(pathname) {
    var m = /^\/case-studies\/([a-z0-9][a-z0-9-]{0,158})\/?$/i.exec(String(pathname || ''));
    return m && m[1].toLowerCase() !== 'record' ? m[1] : null;
  }

  function talentHref(slug) { return '/talent/' + encodeURIComponent(slug) + '/'; }

  /* The builder as the page shows them. `builderPortfolioSlug` is set only when the person
     is reachable on Hire; without it the chip renders, unlinked.

     A RECORD THAT NAMES A ROLE, NOT A PERSON, STILL HAS A PERSON ON HIRE. Records written
     role-only ("AI Systems Architect") cross with `builder.name` null, so the Cora records
     drew no "Built by" chip and no Request intro, on a site whose whole point is the
     person (audit, 2026-11-08). When the server says the record links to a listed
     portfolio, `person` is that portfolio's own public identity, which its owner already
     chose to publish; the record's role title still wins over the portfolio headline. */
  function builderOf(body, person) {
    var b = body.caseStudy.builder || {};
    var slug = typeof body.builderPortfolioSlug === 'string' ? body.builderPortfolioSlug : null;
    var p = slug && person && person.name ? person : null;
    var name = b.name || (p && p.name);
    if (!name) return null;
    return {
      name: name, role: b.roleTitle || (p && p.role) || null,
      avatarUrl: b.photoUrl || (p && p.avatarUrl) || null, slug: slug,
    };
  }

  /* The public portfolio's identity, reduced to what the chip needs. Null on anything else. */
  function personFromPortfolio(res) {
    var id = res && res.ok && res.body && res.body.portfolio && res.body.portfolio.identity;
    if (!id || typeof id.full_name !== 'string' || !id.full_name) return null;
    return { name: id.full_name, role: id.headline || null, avatarUrl: id.avatar_data_url || null };
  }

  /* `verified` is the only class worth a badge here; anything else prints nothing rather
     than a weaker-sounding label an employer would read as a warning. */
  function verifyBadge(c) {
    return c.verificationClass === 'verified' ? '<span class="verify">✓ Verified</span>' : '';
  }

  function hero(body, person) {
    var c = body.caseStudy;
    var who = builderOf(body, person);
    var chip = '';
    if (who) {
      var inner = C.avatar({ slug: who.slug || who.name, name: who.name, avatarUrl: who.avatarUrl }, 46, false)
        + '<span><b>Built by ' + esc(who.name) + '</b><span>' + (who.role ? esc(who.role) + (who.slug ? ' · ' : '') : '') + (who.slug ? 'view full portfolio →' : '') + '</span></span>';
      chip = who.slug ? '<a class="builder" href="' + talentHref(who.slug) + '">' + inner + '</a>' : '<span class="builder">' + inner + '</span>';
    }
    return '<section class="hire-hero"><div class="art">' + C.art(c.slug, { n: 12 }) + '</div><div class="wrap">'
      + '<span class="eyebrow">★ Published case study' + (c.industry ? ' · ' + esc(C.industryLabel(c.industry)) : '') + '</span>' + verifyBadge(c)
      + '<h1 id="cs-title" tabindex="-1">' + esc(c.title) + '</h1>'
      + (c.standfirst ? '<p class="dek">' + esc(c.standfirst) + '</p>' : '')
      + chip + '</div></section>';
  }

  /* A tile's figure. The unit is appended ONLY to a bare number ("448" + "tests"). A display
     value that is already a phrase carries its own noun, so appending printed "6m14s, failure
     to healthy seconds" and "1 of 6 sources live sources" (Quincy, 2026-11-11). The enterprise
     page made the same call in CaseStudyMeasurement.unitAlreadyInValue. */
  function figure(x) {
    var v = String(x.valueDisplay == null ? '' : x.valueDisplay).trim();
    var bare = /^[-+]?[\d.,]+%?$/.test(v);
    return v + (bare && x.unit ? ' ' + x.unit : '');
  }

  /* Outcome tiles: the record's own published hero metrics, at most four, gold. */
  function outcomes(body) {
    var m = arr(body.caseStudy.heroMetrics).slice(0, 4);
    if (!m.length) return '';
    return '<div class="outcomes">' + m.map(function (x) {
      return '<div><b>' + esc(figure(x)) + '</b><span>' + esc(x.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function hireCard(body, person) {
    var who = builderOf(body, person);
    var c = body.caseStudy;
    var repos = arr(c.repositories);
    var priv = Number(c.privateRepositoryCount) || 0;
    var project = '<div class="side-card"><div class="label">Project</div>'
      + (c.organizationLabel ? '<p style="font-weight:600">' + esc(c.organizationLabel) + '</p>' : '')
      + (arr(c.stack).length ? '<div class="label" style="margin-top:16px">Stack</div><div class="tags">' + arr(c.stack).map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div>' : '')
      + (repos.length ? '<div class="label" style="margin-top:16px">Repository</div>' + repos.map(function (r) {
        return /^https:\/\//.test(String(r.url || '')) ? '<p><a class="mono" style="font-size:.82rem;color:var(--accent)" href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + '</a></p>' : '';
      }).join('') : '')
      + (priv > 0 ? (repos.length ? '' : '<div class="label" style="margin-top:16px">Repository</div>')
        + '<p style="font-size:.82rem;color:var(--fg-muted)">' + priv + ' private ' + (priv === 1 ? 'repository' : 'repositories') + '</p>' : '')
      + '</div>';
    if (!who) return '<aside><div class="sticky">' + project + '</div></aside>';
    var introHref = '/intro/' + (who.slug ? '?talent=' + encodeURIComponent(who.slug) : '');
    return '<aside><div class="sticky"><div class="hire-cta">'
      + C.avatar({ slug: who.slug || who.name, name: who.name, avatarUrl: who.avatarUrl }, 88, !!who.slug)
      + '<h4>' + esc(who.name) + '</h4>' + (who.role ? '<p>' + esc(who.role) + '</p>' : '')
      + '<a class="btn btn-primary" href="' + introHref + '" data-intro="' + esc(who.slug || '') + '">Request intro</a>'
      + (who.slug ? '<a class="btn btn-ghost" href="' + talentHref(who.slug) + '">See full portfolio</a>' : '')
      + '</div>' + project + '</div></aside>';
  }

  return {
    isPayload: isPayload, slugFromPath: slugFromPath, builderOf: builderOf,
    personFromPortfolio: personFromPortfolio, hero: hero, outcomes: outcomes, hireCard: hireCard,
  };
}));
