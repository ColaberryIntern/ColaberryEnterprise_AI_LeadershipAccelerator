/*
 * hire.refactored.ai - the directory (`/`).
 *
 * Reads GET /api/public/hire/talent and upgrades the honest empty state that ships in
 * index.html. Filter state lives in the query string (`?track=fde&q=claims`) so a
 * filtered view is shareable. Pure render functions are exported for node's test runner.
 *
 * FAILURE-FIRST: if the API is unreachable, slow (10s cap) or returns anything but a
 * well-formed payload, the page keeps its built-in "Nobody is listed yet" state. It never
 * renders sample data, never spins forever, and never retries in a loop.
 */
(function (root, factory) {
  var common = typeof module === 'object' && module.exports ? require('./common.js') : root.HireCommon;
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HireDirectory = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  var esc = C.esc;

  var TRACKS = [
    { key: '', label: 'All' },
    { key: 'fde', label: 'Forward Deployed' },
    { key: 'ai-engineer', label: 'AI Engineer' },
    { key: 'architect', label: 'Architect' },
    { key: 'analytics', label: 'Analytics' },
  ];
  var SORTS = [
    { key: 'featured', label: 'Sort: Featured' },
    { key: 'case_studies', label: 'Most case studies' },
    { key: 'verified_commits', label: 'Most verified commits' },
    { key: 'newest', label: 'Newest' },
  ];
  var TRACK_KEYS = TRACKS.map(function (t) { return t.key; });
  var SORT_KEYS = SORTS.map(function (s) { return s.key; });

  /* Query string <-> filter state. Unknown values are dropped, never forwarded. */
  function parseFilters(search) {
    var p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    var track = p.get('track') || '';
    var sort = p.get('sort') || 'featured';
    return {
      q: (p.get('q') || '').slice(0, 80),
      track: TRACK_KEYS.indexOf(track) >= 0 ? track : '',
      sort: SORT_KEYS.indexOf(sort) >= 0 ? sort : 'featured',
    };
  }
  function filtersToQuery(f) {
    var p = new URLSearchParams();
    if (f.q && f.q.trim()) p.set('q', f.q.trim().slice(0, 80));
    if (f.track) p.set('track', f.track);
    if (f.sort && f.sort !== 'featured') p.set('sort', f.sort);
    var s = p.toString();
    return s ? '?' + s : '';
  }

  /* A payload is trusted only in shape: anything else is treated as "API down". */
  function isPayload(body) {
    return !!(body && body.ok === true && Array.isArray(body.talent) && body.totals && typeof body.totals === 'object');
  }

  function n(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0; }

  function renderHero(totals) {
    var steps = [
      ['Build', 'Ships a real project in their own repository', '✓ repo'],
      ['Verify', 'Commits checked against acceptance criteria', '✓ criteria'],
      ['Publish', 'Project turned into a reviewed case study', '✓ case study'],
      ['Listed', 'Profile goes live on hire.refactored.ai', '★ live'],
    ];
    return '<section class="hero"><div class="wrap fade"><div>'
      + '<span class="eyebrow">★ Every profile here has shipped. Every claim is a case study.</span>'
      + '<h1>Hire the engineers who\'ve <em>already deployed</em> AI into real work.</h1>'
      + '<p class="lede">Forward-deployed and frontier AI engineers, made on the Refactored.ai platform. Nobody appears on this page until a project they built has been verified and published as a case study.</p>'
      + '<div class="ctas"><a class="btn btn-primary" href="#talent" data-scroll="talent">Browse proven talent ↓</a><a class="btn btn-ghost" href="#how" data-scroll="how">How someone gets listed</a></div>'
      + '<div class="ledger">'
      + '<div><b data-count="' + n(totals.listed) + '">' + n(totals.listed) + '</b><span>engineers listed</span></div>'
      + '<div><b data-count="' + n(totals.caseStudies) + '">' + n(totals.caseStudies) + '</b><span>published case studies</span></div>'
      + '<div><b data-count="' + n(totals.verifiedCommits) + '">' + n(totals.verifiedCommits) + '</b><span>commits verified</span></div>'
      + '<div><b data-count="' + n(totals.industries) + '">' + n(totals.industries) + '</b><span>industries shipped into</span></div>'
      + '</div></div>'
      + '<div class="gate"><div class="head"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="label">listing gate</span></div>'
      + steps.map(function (s, i) {
        return '<div class="step anim ' + (i < 3 ? 'done' : 'listed') + '" style="animation-delay:' + (0.25 + i * 0.35).toFixed(2) + 's">'
          + '<span class="n" aria-hidden="true">' + (i < 3 ? '✓' : '★') + '</span><div><h4>' + s[0] + '</h4><p>' + s[1] + '</p></div><span class="tag">' + s[2] + '</span></div>';
      }).join('')
      + '<div class="rule">if <b>case_studies.published == 0</b> → profile is not listed</div></div>'
      + '</div></section>';
  }

  function caseLink(slug) { return '/case-studies/' + encodeURIComponent(slug) + '/'; }
  function talentLink(slug) { return '/talent/' + encodeURIComponent(slug) + '/'; }

  function spotCard(t, flagged, api) {
    var sig = t.signature || null;
    var metric = sig && sig.heroMetric
      ? '<div><b class="gold">' + esc(sig.heroMetric.value) + '</b><span>' + esc(sig.heroMetric.label) + '</span></div>' : '';
    return '<a class="spot-card" href="' + talentLink(t.slug) + '" data-talent="' + esc(t.slug) + '">'
      + '<div class="art">' + (sig ? C.cover(sig, api, 9) : C.art(t.slug, { n: 9 })) + '<span class="ribbon">' + (flagged ? '★ Spotlight' : '★ Latest') + '</span></div>'
      + '<div class="body">' + C.avatar(t, 84)
      + '<h3>' + esc(t.name) + '</h3>' + (t.role ? '<div class="role">' + esc(t.role) + '</div>' : '')
      + (sig ? '<div class="lead"><small>Signature case study</small>' + esc(sig.title) + '</div>' : '')
      + '<div class="metrics">' + metric
      + '<div><b>' + n(t.caseStudyCount) + '</b><span>case ' + C.plural(n(t.caseStudyCount), 'study', 'studies') + '</span></div>'
      + '<div><b>' + n(t.verifiedCommitCount) + '</b><span>verified commits</span></div>'
      + '</div></div></a>';
  }

  /* The spotlight band. Its heading follows the API's `spotlightSource`: a FLAGGED
     spotlight is "Spotlight"; the fallback is labelled for what it is, never as a pick. */
  function renderSpotlight(spot, source, api) {
    if (!Array.isArray(spot) || !spot.length) return '';
    var flagged = source === 'flagged';
    return '<section class="block"><div class="wrap">'
      + '<div class="sec-head"><div><div class="label">' + (flagged ? '★ Spotlight' : '★ Latest') + '</div>'
      + '<h2>' + (flagged ? 'This month\'s standout builders' : 'Latest standout builders') + '</h2></div>'
      + '<span class="muted" style="font-size:.9rem">' + (flagged ? 'Chosen by the strength of their published case studies.' : 'The most recently published case studies.') + '</span></div>'
      + '<div class="spot">' + spot.slice(0, 3).map(function (t) { return spotCard(t, flagged, api); }).join('') + '</div></div></section>';
  }

  function availability(a) {
    if (!a || !a.label) return '';
    var kind = ['open', 'interviewing', 'placed'].indexOf(a.kind) >= 0 ? a.kind : 'open';
    return '<span class="avail ' + kind + '">' + esc(a.label) + '</span>';
  }

  function talentCard(t, shortlist) {
    var sig = t.signature || null;
    var caps = Array.isArray(t.capabilities) ? t.capabilities.slice(0, 3) : [];
    var on = shortlist.indexOf(t.slug) >= 0;
    var meta = [t.location, t.cohort ? 'Cohort ' + t.cohort : ''].filter(Boolean).map(esc).join(' · ');
    return '<article class="tcard fade">'
      + '<a class="tcard-link" href="' + talentLink(t.slug) + '" data-talent="' + esc(t.slug) + '" aria-label="' + esc(t.name) + (t.role ? ', ' + esc(t.role) : '') + '"></a>'
      + '<div class="top">' + C.avatar(t, 60) + '<div><h3>' + esc(t.name) + '</h3>'
      + (t.role ? '<div class="role">' + esc(t.role) + '</div>' : '') + (meta ? '<div class="loc">' + meta + '</div>' : '') + '</div></div>'
      + (t.headline ? '<p class="hl">' + esc(t.headline) + '</p>' : '')
      + (sig ? '<div class="cs"><i aria-hidden="true">★</i><span>' + esc(sig.title) + '</span></div>' : '')
      + (caps.length ? '<div class="tags">' + caps.map(function (c) { return '<span class="tag' + (c.proven ? ' ok' : '') + '">' + (c.proven ? '✓ ' : '') + esc(c.name) + '</span>'; }).join('') + '</div>' : '')
      + '<div class="foot">' + availability(t.availability)
      + '<span><span class="faint mono" style="font-size:.75rem;margin-right:8px">' + n(t.caseStudyCount) + ' case ' + C.plural(n(t.caseStudyCount), 'study', 'studies') + '</span>'
      + '<button type="button" class="star-btn' + (on ? ' on' : '') + '" data-star="' + esc(t.slug) + '" data-name="' + esc(t.name) + '" aria-pressed="' + on + '" aria-label="Shortlist ' + esc(t.name) + '">★</button></span></div>'
      + '</article>';
  }

  function renderGrid(talent, shortlist) {
    return talent.length
      ? talent.map(function (t) { return talentCard(t, shortlist); }).join('')
      : '<div class="empty">No listed engineers match that yet. Try a broader search or clear the filter.</div>';
  }

  function renderFilters(f) {
    return '<div class="filters" role="search">'
      + '<div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
      + '<label class="visually-hidden" for="q">Search listed talent</label>'
      + '<input id="q" type="search" maxlength="80" autocomplete="off" placeholder="Search by skill, industry, or problem, e.g. “claims”, “agent tool use”" value="' + esc(f.q) + '"></div>'
      + TRACKS.map(function (t) { return '<button type="button" class="chip' + (f.track === t.key ? ' on' : '') + '" data-track="' + t.key + '" aria-pressed="' + (f.track === t.key) + '">' + t.label + '</button>'; }).join('')
      + '<label class="visually-hidden" for="sort">Sort</label><select class="sel" id="sort">'
      + SORTS.map(function (s) { return '<option value="' + s.key + '"' + (f.sort === s.key ? ' selected' : '') + '>' + s.label + '</option>'; }).join('')
      + '</select></div>';
  }

  function renderStrip(talent, api) {
    var cards = talent.filter(function (t) { return t.signature && t.signature.slug; }).map(function (t) {
      var s = t.signature;
      return '<a class="mini" href="' + caseLink(s.slug) + '" target="_blank" rel="noopener" data-launch data-from="strip" data-case="' + esc(s.slug) + '" data-talent-slug="' + esc(t.slug) + '">'
        + '<div class="art">' + C.cover(s, api, 7) + '</div>'
        + '<div class="t"><b>' + esc(s.title) + '</b><span>' + esc(t.name) + (s.industry ? ' · ' + esc(s.industry) : '') + '</span></div></a>';
    });
    if (!cards.length) return '';
    return '<section class="block" id="published" style="padding-top:10px"><div class="wrap">'
      + '<div class="sec-head"><div><div class="label">The proof library</div><h2>Latest published case studies</h2></div></div>'
      + '<div class="strip">' + cards.join('') + '</div></div></section>';
  }

  function renderHow() {
    var rows = [
      ['01 · build', 'Real work, real repo', 'Participants deploy an AI system into a real workflow, committed to their own repository.'],
      ['02 · verify', 'Commits meet criteria', 'Each story is checked against acceptance criteria. What passed is what the profile shows.'],
      ['03 · publish', 'A reviewed case study', 'The project becomes a case study: the problem, what was built, how it works, and the outcome.'],
      ['04 · listed', 'Employers find them', 'The profile goes live here. Every skill on it points at a commit or a case study.'],
    ];
    return '<section class="block" id="how" style="border-top:1px solid var(--line)"><div class="wrap">'
      + '<div class="sec-head"><div><div class="label">Why this list is different</div><h2>No case study, no listing.</h2></div></div>'
      + '<div class="how">' + rows.map(function (r) { return '<div><span class="k">' + r[0] + '</span><h4>' + r[1] + '</h4><p>' + r[2] + '</p></div>'; }).join('') + '</div>'
      + '</div></section>';
  }

  /* The whole page body for a payload. The talent section is always present so filters
     stay reachable; an EMPTY directory (nobody listed at all) keeps the honest copy. */
  function renderDirectory(body, f, shortlist, api) {
    var talent = body.talent;
    var nobody = n(body.totals.listed) === 0 && !talent.length && !f.q && !f.track;
    return renderHero(body.totals)
      + renderSpotlight(body.spotlight, body.spotlightSource, api)
      + '<section class="block" id="talent" style="padding-top:20px"><div class="wrap">'
      + '<div class="sec-head"><div><div class="label">All listed talent</div><h2>Proven in production</h2></div></div>'
      + (nobody ? '<div class="empty"><h3 class="mono">Nobody is listed yet</h3>Engineers appear here only after a project they built is verified and published as a case study.</div>'
        : renderFilters(f) + '<div class="grid" id="grid" aria-live="polite">' + renderGrid(talent, shortlist) + '</div>')
      + '</div></section>'
      + renderStrip(talent, api)
      + renderHow();
  }

  return {
    TRACKS: TRACKS, SORTS: SORTS, parseFilters: parseFilters, filtersToQuery: filtersToQuery,
    isPayload: isPayload, renderHero: renderHero, renderSpotlight: renderSpotlight,
    talentCard: talentCard, renderGrid: renderGrid, renderStrip: renderStrip,
    renderDirectory: renderDirectory, talentLink: talentLink, caseLink: caseLink,
  };
}));
