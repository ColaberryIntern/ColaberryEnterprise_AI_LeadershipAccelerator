/*
 * hire.refactored.ai - the portfolio (`/talent/<slug>/`), rendered from
 * GET /api/public/portfolios/:slug?surface=hire.
 *
 * Section order (profile upgrade, docs/hire-refactored/profile-upgrade-demo/PROMPT.md §1.1):
 * banner art, head, proof ledger, case-study carousel + thumbnails, in their words, about,
 * verified commits, experience; sidebar: book an interview, proven in their repo, industries,
 * contact, back to all talent. The two candidate-written pieces live in profile-extras.js and
 * collapse when absent (no open time keeps Request intro). Pure render functions are exported
 * for node's test runner; carousel.js runs the carousel.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP. (1) Hire shows a person's work ONLY as approved,
 * Hire-published case studies (Ali, 2026-11-11: "No projects they are working on or that
 * haven't been converted"). A project with no published case study renders NOTHING: no
 * "in review" card, no title. The API already strips them (backend hireCaseStudyOnly); this
 * is the second layer. (2) `years_experience` prints only when
 * it reconciles with the experience the page itself lists; the old preview printed
 * "26 years" beside a ten-year history, and a hiring manager reads that as a lie.
 */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var common = node ? require('./common.js') : root.HireCommon;
  var extras = node ? require('./profile-extras.js') : root.HireProfileExtras;
  var api = factory(common, extras);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HirePortfolio = api;
}(typeof self !== 'undefined' ? self : this, function (C, X) {
  'use strict';
  var esc = C.esc;
  var arr = function (v) { return Array.isArray(v) ? v : []; };
  var num = function (v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; };
  var caseLink = function (slug) { return '/case-studies/' + encodeURIComponent(slug) + '/'; };

  function isPayload(body) {
    return !!(body && body.ok === true && body.portfolio && body.portfolio.identity
      && typeof body.portfolio.identity.full_name === 'string' && body.hire && typeof body.hire === 'object');
  }

  /* Years spanned by the listed roles, earliest start to latest end (or now). */
  function experienceSpanYears(items, now) {
    var t = now || new Date();
    var starts = []; var ends = [];
    arr(items).forEach(function (x) {
      var s = Date.parse(x && x.start); if (!isNaN(s)) starts.push(s);
      var e = x && x.end ? Date.parse(x.end) : t.getTime(); if (!isNaN(e)) ends.push(e);
    });
    if (!starts.length || !ends.length) return null;
    return (Math.max.apply(null, ends) - Math.min.apply(null, starts)) / (365.25 * 24 * 3600 * 1000);
  }

  /* `years_experience` is shown only within a year of what the listed roles add up to. */
  function reconciledYears(stats, experience, now) {
    var claimed = num(stats && stats.years_experience);
    var span = experienceSpanYears(experience, now);
    if (claimed === null || span === null) return null;
    return Math.abs(claimed - span) <= 1 ? Math.round(claimed) : null;
  }

  /*
   * A headline figure as a ledger tile: the leading number of the record's own display value,
   * with the rest of that value as the caption. "97% of lost completion events resolved"
   * becomes 97% / "of lost completion events resolved". A value that does not START with a
   * number ("Recovered in 1m31s") is not a tile, and neither is a zero ("0 retries ...", a
   * reduction, reads as nothing on a tile). Nothing is rounded, summed or invented.
   */
  function metricTile(m) {
    var v = String((m && m.value) || '').trim();
    var x = /^([-+]?\d[\d,]*(?:\.\d+)?%?)(?:\s+([\s\S]+))?$/.exec(v);
    if (!x) return null;
    var n = parseFloat(x[1].replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) return null;
    var label = x[2] || String((m && m.label) || '').trim();
    return label ? { big: x[1], label: label, n: n } : null;
  }

  /*
   * The four ledger tiles. NEVER A ZERO TILE (profile upgrade, 2026-11-12): Kes's ledger read
   * "0 verified commits · 0 capabilities" beside nine published case studies. A zero or
   * missing figure is dropped and the next real figure takes its place: the record's headline
   * figures, largest first, then how many case studies carry a video walkthrough.
   */
  function ledgerTiles(p, hire, now) {
    var stats = p.stats || {};
    var cases = arr(hire.caseStudies).filter(function (c) { return c && c.slug; });
    var cs = cases.length;
    var commits = arr(p.verified_commits).length;
    var caps = arr(p.capabilities).filter(function (c) { return c && c.proven; }).length || arr(p.capabilities).length;
    var years = reconciledYears(stats, p.experience, now);
    var files = num(stats.files_committed);
    var tiles = [];
    if (cs > 0) tiles.push({ big: String(cs), label: 'published case ' + C.plural(cs, 'study', 'studies'), gold: true });
    if (commits > 0) tiles.push({ big: String(commits), label: 'verified commits' });
    if (caps > 0) tiles.push({ big: String(caps), label: 'capabilities proven in code' });
    if (years !== null && years > 0) tiles.push({ big: String(years), label: 'years of experience' });
    else if (files !== null && files > 0) tiles.push({ big: String(files), label: 'files committed' });
    var seen = {};
    var figures = cases.map(function (c) { return metricTile(c.heroMetric); })
      .filter(function (t) { if (!t || seen[t.big + t.label]) return false; seen[t.big + t.label] = true; return true; })
      .sort(function (a, b) { return b.n - a.n; });
    var walks = cases.filter(function (c) { return num(look(c).walkthroughSeconds) > 0; }).length;
    var fill = figures.concat(walks > 0 ? [{ big: String(walks), label: 'video ' + C.plural(walks, 'walkthrough', 'walkthroughs') }] : []);
    while (tiles.length < 4 && fill.length) tiles.push(fill.shift());
    return tiles.slice(0, 4);
  }

  function ledger(p, hire, now) {
    var tiles = ledgerTiles(p, hire, now);
    return tiles.length ? '<div class="p-ledger">' + tiles.map(function (t) {
      return '<div' + (t.gold ? ' class="gold"' : '') + '><b>' + esc(t.big) + '</b><span>' + esc(t.label) + '</span></div>';
    }).join('') + '</div>' : '';
  }

  /*
   * THE DIFFERENTIATORS (Ali, 2026-11-11: Kes's nine cards "on the surface they all look the
   * same"). Each card now shows what is unique to its record: its picked cover with the
   * walkthrough length on it, the capability it proves, its headline figure, and a proof row.
   * EVERY PIECE COLLAPSES WHEN ABSENT: no cover keeps the generated art (never a blank box), no
   * figure / capability / proof renders nothing at all, so an unfinished record shows no holes.
   */
  function look(c) { return (c && c.look && typeof c.look === 'object') ? c.look : {}; }

  function cover(c, api, n) { return C.cover(c, api, n); } // shared with the directory

  function capability(c) {
    var label = C.capabilityLabel(look(c).capability);
    return label ? '<span class="cap-line">' + esc(label) + '</span>' : '';
  }

  function figure(c) {
    var m = c && c.heroMetric;
    return m && m.value && m.label ? '<div class="fig"><b>' + esc(m.value) + '</b><span>' + esc(m.label) + '</span></div>' : '';
  }

  function proof(c) {
    var L = look(c);
    var chips = [
      L.verified ? '✓ Verified' : '',
      L.workflowDiagram ? 'Workflow diagram' : '',
      L.decisions > 0 ? L.decisions + ' ' + C.plural(L.decisions, 'decision', 'decisions') : '',
      L.repositories > 0 ? L.repositories + ' ' + C.plural(L.repositories, 'repo', 'repos') : '',
    ].filter(Boolean);
    return chips.length ? '<div class="proof">' + chips.map(function (t) {
      return '<span' + (t === '✓ Verified' ? ' class="ok"' : '') + '>' + esc(t) + '</span>';
    }).join('') + '</div>' : '';
  }

  /*
   * THE CAROUSEL SLIDES (profile upgrade, 2026-11-12). Every published Hire case study,
   * exactly once: the signature first, then the candidate's own order (`hire.caseStudyOrder`,
   * set in the studio) where they set one, then the API's order. A project only ever appears
   * AS its published case study, so a project with none contributes nothing: the slides are
   * built from `hire.caseStudies`, never from `projects`. `projects` only decides the kicker.
   */
  function carouselSlides(hire, projects) {
    var seen = {};
    var cases = arr(hire && hire.caseStudies).filter(function (c) {
      if (!c || !c.slug || seen[c.slug]) return false;
      seen[c.slug] = true;
      return true;
    });
    var sigSlug = hire && hire.signature && seen[hire.signature.slug] ? hire.signature.slug : null;
    var viaProject = {};
    arr(projects).forEach(function (x) { if (x && x.case_study_slug) viaProject[x.case_study_slug] = true; });
    var order = arr(hire && hire.caseStudyOrder).filter(function (s) { return typeof s === 'string'; });
    var rank = function (c, i) { var r = order.indexOf(c.slug); return r >= 0 ? r : order.length + i; };
    var sorted = cases.map(function (c, i) { return { c: c, r: rank(c, i) }; })
      .sort(function (a, b) { return a.r - b.r; }).map(function (x) { return x.c; });
    if (sigSlug) sorted = sorted.filter(function (c) { return c.slug === sigSlug; }).concat(sorted.filter(function (c) { return c.slug !== sigSlug; }));
    return sorted.map(function (c) {
      return { cs: c, kind: c.slug === sigSlug ? 'signature' : (viaProject[c.slug] ? 'project' : 'published') };
    });
  }

  var KICKER = { signature: '★ Signature case study', project: 'Project · published case study', published: 'Published case study' };
  var ICON = {
    pause: '<svg class="i-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg class="i-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    disc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
  };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  function launchAttrs(cs, talentSlug, from) {
    return ' href="' + caseLink(cs.slug) + '" target="_blank" rel="noopener" data-launch data-from="' + from + '" data-case="' + esc(cs.slug) + '" data-talent-slug="' + esc(talentSlug) + '"';
  }

  function slide(s, i, n, talentSlug, api) {
    var cs = s.cs;
    return '<div class="car-slide' + (i === 0 ? ' on' : '') + '" role="group" aria-roledescription="slide" aria-label="' + (i + 1) + ' of ' + n + '"'
      + ' data-kicker="' + esc(KICKER[s.kind]) + '"' + (i === 0 ? '' : ' hidden') + '>'
      // One keyboard stop per slide: the visible "Open the case study" link. The cover is the
      // same link for the mouse, kept out of the tab order and the accessibility tree.
      + '<a class="car-art art"' + launchAttrs(cs, talentSlug, 'carousel') + ' tabindex="-1" aria-hidden="true">'
      + '<span class="car-frame">' + cover(cs, api, 10) + '<span class="car-disc">' + ICON.disc + '</span></span></a>'
      + '<div class="car-body">' + capability(cs) + '<h2>' + esc(cs.title) + '</h2>' + figure(cs)
      + (cs.summary ? '<p>' + esc(cs.summary) + '</p>' : '') + proof(cs)
      + '<a class="open-cue"' + launchAttrs(cs, talentSlug, 'carousel') + ' aria-label="Open the case study: ' + esc(cs.title) + '">Open the case study ' + C.ARROW + '</a></div></div>';
  }

  /*
   * The carousel, as markup only (carousel.js runs the timer). Slide 1 is shown, the rest
   * carry `hidden`. With one case study there is nothing to page through, so it renders
   * without controls, counter, progress line or thumbnails.
   */
  function carousel(slides, talentSlug, api) {
    var n = arr(slides).length;
    if (!n) return '';
    var many = n > 1;
    return '<section class="car" data-car aria-roledescription="carousel" aria-label="Published case studies">'
      + '<div class="car-top"><div class="car-kicker" data-car-kicker>' + esc(KICKER[slides[0].kind]) + '</div>'
      + (many ? '<div class="car-ctrls"><span class="car-count" data-car-count aria-live="polite">01 / ' + pad2(n) + '</span>'
        + '<button type="button" class="btn btn-ghost btn-icon" data-car-play aria-label="Pause carousel">' + ICON.pause + ICON.play + '</button>'
        + '<button type="button" class="btn btn-ghost btn-icon" data-car-prev aria-label="Previous case study">' + ICON.prev + '</button>'
        + '<button type="button" class="btn btn-ghost btn-icon" data-car-next aria-label="Next case study">' + ICON.next + '</button></div>' : '')
      + '</div>'
      + (many ? '<div class="car-progress" aria-hidden="true"><i data-car-bar></i></div>' : '')
      + slides.map(function (s, i) { return slide(s, i, n, talentSlug, api); }).join('')
      + '</section>'
      + (many ? thumbs(slides, api) : '');
  }

  /* One button per slide. The row WRAPS; nothing on this page scrolls sideways at 390px. */
  function thumbs(slides, api) {
    return '<div class="thumbs" data-car-thumbs role="group" aria-label="Jump to a case study">'
      + slides.map(function (s, i) {
        var url = C.thumbUrl(api, look(s.cs).coverImageUrl);
        return '<button type="button" data-car-go="' + i + '" aria-current="' + (i === 0) + '" aria-label="Case study ' + (i + 1) + ': ' + esc(s.cs.title) + '">'
          + (url ? '<img src="' + esc(url) + '" alt="" width="320" height="180" loading="lazy" decoding="async">' : C.art(s.cs.slug, { n: 6 })) + '</button>';
      }).join('') + '</div>';
  }

  /*
   * Published case studies the page would otherwise never link: not the signature, and not
   * reached through a project card. Kes's page said "9 published" and linked 2 (2026-11-10),
   * because a case study only appeared through its project and he has 2 projects. The count
   * on the badge and the links on the page now always agree. Order is the API's order.
   */
  function unlinkedCaseStudies(hire, projects, sig) {
    var linked = {};
    if (sig) linked[sig.slug] = true;
    arr(projects).forEach(function (x) { if (x && x.case_study_slug) linked[x.case_study_slug] = true; });
    var seen = {};
    return arr(hire.caseStudies).filter(function (c) {
      if (!c || !c.slug || linked[c.slug] || seen[c.slug]) return false;
      seen[c.slug] = true;
      return true;
    });
  }

  function commits(list) {
    return list.map(function (c) {
      var crit = num(c.criteria_passed) !== null && num(c.criteria_total) !== null ? '<span class="crit">' + c.criteria_passed + '/' + c.criteria_total + ' criteria ✓</span>' : '<span></span>';
      var url = /^https:\/\/github\.com\//.test(String(c.commit_url || '')) ? c.commit_url : null;
      var sha = url ? '<a class="sha" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(c.commit_sha_short) + '</a>' : '<span class="sha">' + esc(c.commit_sha_short) + '</span>';
      return '<div class="commit">' + sha + '<span>' + esc(c.title || 'Verified story') + '</span>' + crit + '</div>';
    }).join('');
  }

  function fmtMonth(v) {
    var d = Date.parse(v); if (isNaN(d)) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function experience(items) {
    return items.map(function (x) {
      var when = [fmtMonth(x.start), x.end ? fmtMonth(x.end) : 'Present'].filter(Boolean).join(' to ');
      return '<div class="xp"><div class="when">' + esc(when) + '</div><div><b>' + esc(x.title) + '</b><span>' + esc(x.company) + '</span></div></div>';
    }).join('');
  }

  function sidebar(p, hire, slug, tz) {
    var book = X.bookCard(hire.booking, slug, tz);
    var caps = arr(p.capabilities);
    var max = caps.reduce(function (m, c) { return Math.max(m, num(c.count) || 0); }, 0) || 1;
    var id = p.identity;
    var industries = arr(hire.caseStudies).map(function (c) { return C.industryLabel(c.industry); }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var contact = [
      id.linkedin_url && /^https:\/\//.test(id.linkedin_url) ? '<div class="row">in <a href="' + esc(id.linkedin_url) + '" target="_blank" rel="noopener">LinkedIn</a></div>' : '',
      id.github_url && /^https:\/\//.test(id.github_url) ? '<div class="row">⌥ <a href="' + esc(id.github_url) + '" target="_blank" rel="noopener">' + esc(id.github_url.replace(/^https:\/\//, '')) + '</a></div>' : '',
    ].join('');
    return '<aside class="side">' + book
      + (caps.length ? '<div class="card"><div class="label">Proven in their repo</div><div style="margin-top:10px">' + caps.map(function (c) {
        var pct = Math.max(8, Math.round(((num(c.count) || 0) / max) * 100));
        return '<div class="cap"><b>' + esc(c.name) + '</b><span class="ev">' + (c.proven ? 'proven' : esc(num(c.count) || 0) + ' evidence') + '</span><div class="barw"><div class="bar" style="width:' + pct + '%"></div></div></div>';
      }).join('') + '</div></div>' : '')
      + (industries.length ? '<div class="card"><div class="label">Industries shipped into</div><div class="tags">' + industries.map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div></div>' : '')
      // Bookable: the booking card above is the way in, so Contact keeps only the links (kit §1.1).
      + (book ? (contact ? '<div class="card"><div class="label">Contact</div>' + contact + '</div>' : '')
        : '<div class="card"><div class="label">Contact</div>' + contact
          + '<p class="muted" style="font-size:.86rem;margin:8px 0 12px">Introductions are made by the Colaberry team.</p>'
          + '<a class="btn btn-primary btn-block" href="/intro/?talent=' + encodeURIComponent(slug) + '" data-intro="' + esc(slug) + '">Request intro</a></div>')
      + '<a class="btn btn-ghost btn-block" href="/">← Back to all talent</a></aside>';
  }

  var LINK_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>';

  var CAL_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

  /* The head's primary action: Schedule interview when bookable, else today's Request intro. */
  function primaryAction(hire, slug) {
    return X.bookable(hire.booking)
      ? '<a class="btn btn-primary" href="' + esc(X.scheduleHref(slug)) + '" data-book="' + esc(slug) + '">' + CAL_ICON + 'Schedule interview</a>'
      : '<a class="btn btn-primary" href="/intro/?talent=' + encodeURIComponent(slug) + '" data-intro="' + esc(slug) + '">Request intro</a>';
  }

  function renderPortfolio(body, slug, shortlist, now, api, tz) {
    var p = body.portfolio; var hire = body.hire; var id = p.identity;
    var zone = tz || X.viewerZone();
    var person = { slug: slug, name: id.full_name, avatarUrl: id.avatar_data_url };
    var slides = carouselSlides(hire, p.projects);
    var csCount = slides.length;
    var on = shortlist.indexOf(slug) >= 0;
    var avail = hire.availability && hire.availability.label
      ? '<span class="avail ' + (['open', 'interviewing', 'placed'].indexOf(hire.availability.kind) >= 0 ? hire.availability.kind : 'open') + '">' + esc(hire.availability.label) + '</span>' : '';
    var meta = [id.location ? '<span>' + esc(id.location) + '</span>' : '', id.cohort_name ? '<span>Cohort · ' + esc(id.cohort_name) + '</span>' : '', avail].join('');
    var about = arr(p.about);
    var vc = arr(p.verified_commits);
    var xp = arr(p.experience);
    return '<div class="p-banner">' + C.art(slug + ':banner', { n: 12 }) + '</div><div class="wrap fade">'
      + '<div class="p-head">' + C.avatar(person, 170) + '<div>'
      + '<span class="verified-pill">★ Case-study verified · ' + csCount + ' published</span>'
      + '<h1>' + esc(id.full_name) + '</h1>' + (id.headline ? '<div class="role">' + esc(id.headline) + '</div>' : '')
      + (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>'
      + '<div class="p-actions">' + primaryAction(hire, slug)
      + '<button type="button" class="btn btn-star' + (on ? ' on' : '') + '" data-star="' + esc(slug) + '" data-name="' + esc(id.full_name) + '" aria-pressed="' + on + '">★ ' + (on ? 'Shortlisted' : 'Shortlist') + '</button>'
      + '<button type="button" class="btn btn-ghost btn-icon" data-copy aria-label="Copy profile link">' + LINK_ICON + '</button></div></div>'
      + ledger(p, hire, now)
      + '<div class="p-cols"><div>' + carousel(slides, slug, api) + X.inTheirWords(hire.intro, api)
      + (about.length ? '<div class="card about"><div class="label">About <span class="src">from their record and resume</span></div>' + about.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' : '')
      + (vc.length ? '<div class="card"><div class="label">Verified commits</div><h3 class="t">The work, commit by commit</h3>' + commits(vc) + '</div>' : '')
      + (xp.length ? '<div class="card"><div class="label">Experience <span class="src">parsed from their resume</span></div>' + experience(xp) + '</div>' : '')
      + '</div>' + sidebar(p, hire, slug, zone) + '</div></div>';
  }

  /* The slug comes from the PATH (/talent/<slug>/); anything that is not one is refused. */
  function slugFromPath(pathname) {
    var m = /^\/talent\/([a-z0-9][a-z0-9-]{0,158})\/?$/i.exec(String(pathname || ''));
    return m && m[1].toLowerCase() !== 'record' ? m[1] : null;
  }

  return {
    isPayload: isPayload, experienceSpanYears: experienceSpanYears, reconciledYears: reconciledYears,
    unlinkedCaseStudies: unlinkedCaseStudies, metricTile: metricTile, ledgerTiles: ledgerTiles,
    carouselSlides: carouselSlides, carousel: carousel,
    renderPortfolio: renderPortfolio, slugFromPath: slugFromPath,
  };
}));
