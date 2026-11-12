/*
 * hire.refactored.ai - the portfolio (`/talent/<slug>/`), rendered from
 * GET /api/public/portfolios/:slug?surface=hire.
 *
 * Section order (SPEC §5): banner art, head, proof ledger, signature case study, projects,
 * about, verified commits, experience; sidebar: proven in their repo, stack, industries,
 * contact, back to all talent. Pure render functions are exported for node's test runner.
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
  var common = typeof module === 'object' && module.exports ? require('./common.js') : root.HireCommon;
  var api = factory(common);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HirePortfolio = api;
}(typeof self !== 'undefined' ? self : this, function (C) {
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

  function ledger(p, hire, now) {
    var stats = p.stats || {};
    var cs = arr(hire.caseStudies).length;
    var commits = arr(p.verified_commits).length;
    var caps = arr(p.capabilities).filter(function (c) { return c && c.proven; }).length || arr(p.capabilities).length;
    var years = reconciledYears(stats, p.experience, now);
    var files = num(stats.files_committed);
    var fourth = years !== null
      ? '<div><b>' + years + '</b><span>years of experience</span></div>'
      : (files !== null ? '<div><b>' + files + '</b><span>files committed</span></div>' : '');
    return '<div class="p-ledger">'
      + '<div class="gold"><b>' + cs + '</b><span>published case ' + C.plural(cs, 'study', 'studies') + '</span></div>'
      + '<div><b>' + commits + '</b><span>verified commits</span></div>'
      + '<div><b>' + caps + '</b><span>capabilities proven in code</span></div>'
      + fourth + '</div>';
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

  function signature(sig, talentSlug, api) {
    if (!sig || !sig.slug) return '';
    var outcomes = arr(sig.outcomes).slice(0, 3);
    return '<div class="label" style="margin-bottom:10px">★ Signature case study</div>'
      + '<a class="sig" href="' + caseLink(sig.slug) + '" target="_blank" rel="noopener" data-launch data-from="signature" data-case="' + esc(sig.slug) + '" data-talent-slug="' + esc(talentSlug) + '">'
      + '<div class="art">' + cover(sig, api, 10) + '</div><div class="body">'
      + '<span class="state pub">Published case study</span>' + capability(sig) + '<h3>' + esc(sig.title) + '</h3>'
      + (sig.summary ? '<p>' + esc(sig.summary) + '</p>' : '')
      + (outcomes.length ? '<div class="metrics" style="margin:0 0 18px">' + outcomes.map(function (o) { return '<div><b class="gold">' + esc(o.value) + '</b><span>' + esc(o.label) + '</span></div>'; }).join('') + '</div>' : '')
      + proof(sig)
      + '<span class="open-cue">Open the case study ' + C.ARROW + '</span></div></a>';
  }

  /* The body every linked case-study card shares; `sub` is the line under the title. */
  function caseBody(cs, sub) {
    return '<div class="b">' + capability(cs) + '<h4>' + esc(cs.title) + '</h4>'
      + (sub ? '<span class="org">' + sub + '</span>' : '')
      + figure(cs)
      + (cs.summary ? '<p>' + esc(cs.summary) + '</p>' : '')
      + proof(cs)
      + '<div class="row"><span class="state pub">★ Case study</span><span class="open-cue">Open ' + C.ARROW + '</span></div></div>';
  }

  /* A project only ever appears AS its published case study; anything else renders nothing. */
  function projectCard(project, published, talentSlug, api) {
    var cs = project && project.case_study_slug ? published[project.case_study_slug] : null;
    if (!cs) return '';
    var org = [project.organization, project.industry].filter(Boolean).map(esc).join(' · ');
    return '<a class="proj" href="' + caseLink(cs.slug) + '" target="_blank" rel="noopener" data-launch data-from="project" data-case="' + esc(cs.slug) + '" data-talent-slug="' + esc(talentSlug) + '">'
      + '<div class="art">' + cover(cs, api, 8) + '</div>'
      + caseBody(cs, esc(project.title) + (org ? ' · ' + org : '')) + '</a>';
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

  function caseCard(cs, talentSlug, api) {
    return '<a class="proj" href="' + caseLink(cs.slug) + '" target="_blank" rel="noopener" data-launch data-from="case-list" data-case="' + esc(cs.slug) + '" data-talent-slug="' + esc(talentSlug) + '">'
      + '<div class="art">' + cover(cs, api, 8) + '</div>'
      // No industry line: it is the same on every card of one person ("education" nine
      // times on Kes's page), which is the sameness this card exists to remove.
      + caseBody(cs, '') + '</a>';
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

  function sidebar(p, hire, slug) {
    var caps = arr(p.capabilities);
    var max = caps.reduce(function (m, c) { return Math.max(m, num(c.count) || 0); }, 0) || 1;
    var id = p.identity;
    var industries = arr(hire.caseStudies).map(function (c) { return c.industry; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    var contact = [
      id.linkedin_url && /^https:\/\//.test(id.linkedin_url) ? '<div class="row">in <a href="' + esc(id.linkedin_url) + '" target="_blank" rel="noopener">LinkedIn</a></div>' : '',
      id.github_url && /^https:\/\//.test(id.github_url) ? '<div class="row">⌥ <a href="' + esc(id.github_url) + '" target="_blank" rel="noopener">' + esc(id.github_url.replace(/^https:\/\//, '')) + '</a></div>' : '',
    ].join('');
    return '<aside class="side">'
      + (caps.length ? '<div class="card"><div class="label">Proven in their repo</div><div style="margin-top:10px">' + caps.map(function (c) {
        var pct = Math.max(8, Math.round(((num(c.count) || 0) / max) * 100));
        return '<div class="cap"><b>' + esc(c.name) + '</b><span class="ev">' + (c.proven ? 'proven' : esc(num(c.count) || 0) + ' evidence') + '</span><div class="barw"><div class="bar" style="width:' + pct + '%"></div></div></div>';
      }).join('') + '</div></div>' : '')
      + (industries.length ? '<div class="card"><div class="label">Industries shipped into</div><div class="tags">' + industries.map(function (s) { return '<span class="tag">' + esc(s) + '</span>'; }).join('') + '</div></div>' : '')
      + '<div class="card"><div class="label">Contact</div>' + contact
      + '<p class="muted" style="font-size:.86rem;margin:8px 0 12px">Introductions are made by the Colaberry team.</p>'
      + '<a class="btn btn-primary btn-block" href="/intro/?talent=' + encodeURIComponent(slug) + '" data-intro="' + esc(slug) + '">Request intro</a></div>'
      + '<a class="btn btn-ghost btn-block" href="/">← Back to all talent</a></aside>';
  }

  function renderPortfolio(body, slug, shortlist, now, api) {
    var p = body.portfolio; var hire = body.hire; var id = p.identity;
    var person = { slug: slug, name: id.full_name, avatarUrl: id.avatar_data_url };
    var published = {};
    arr(hire.caseStudies).forEach(function (c) { if (c && c.slug) published[c.slug] = c; });
    var sig = hire.signature && published[hire.signature.slug] ? hire.signature : null;
    var projects = arr(p.projects).filter(function (x) {
      return x && x.case_study_slug && published[x.case_study_slug] && (!sig || x.case_study_slug !== sig.slug);
    });
    var csCount = arr(hire.caseStudies).length;
    var more = unlinkedCaseStudies(hire, arr(p.projects), sig);
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
      + '<div class="p-actions"><a class="btn btn-primary" href="/intro/?talent=' + encodeURIComponent(slug) + '" data-intro="' + esc(slug) + '">Request intro</a>'
      + '<button type="button" class="btn btn-star' + (on ? ' on' : '') + '" data-star="' + esc(slug) + '" data-name="' + esc(id.full_name) + '" aria-pressed="' + on + '">★ ' + (on ? 'Shortlisted' : 'Shortlist') + '</button>'
      + '<button type="button" class="btn btn-ghost" data-copy>Copy link</button></div></div>'
      + ledger(p, hire, now)
      + '<div class="p-cols"><div>' + signature(sig, slug, api)
      + (more.length ? '<div class="card"><div class="label">Published case studies</div><h3 class="t">' + (sig ? 'More of their published work' : 'Their published work') + '</h3><div class="projs">' + more.map(function (c) { return caseCard(c, slug, api); }).join('') + '</div></div>' : '')
      + (projects.length ? '<div class="card"><div class="label">Projects</div><h3 class="t">Their projects, as published case studies</h3><div class="projs">' + projects.map(function (x) { return projectCard(x, published, slug, api); }).join('') + '</div></div>' : '')
      + (about.length ? '<div class="card about"><div class="label">About <span class="src">from their record and resume</span></div>' + about.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>' : '')
      + (vc.length ? '<div class="card"><div class="label">Verified commits</div><h3 class="t">The work, commit by commit</h3>' + commits(vc) + '</div>' : '')
      + (xp.length ? '<div class="card"><div class="label">Experience <span class="src">parsed from their resume</span></div>' + experience(xp) + '</div>' : '')
      + '</div>' + sidebar(p, hire, slug) + '</div></div>';
  }

  /* The slug comes from the PATH (/talent/<slug>/); anything that is not one is refused. */
  function slugFromPath(pathname) {
    var m = /^\/talent\/([a-z0-9][a-z0-9-]{0,158})\/?$/i.exec(String(pathname || ''));
    return m && m[1].toLowerCase() !== 'record' ? m[1] : null;
  }

  return {
    isPayload: isPayload, experienceSpanYears: experienceSpanYears, reconciledYears: reconciledYears,
    projectCard: projectCard, unlinkedCaseStudies: unlinkedCaseStudies, caseCard: caseCard,
    renderPortfolio: renderPortfolio, slugFromPath: slugFromPath,
  };
}));
