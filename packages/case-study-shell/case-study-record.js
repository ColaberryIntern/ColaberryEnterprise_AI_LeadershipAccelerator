/**
 * One published record, rendered on whichever brand's site the reader is on.
 *
 * WHY THIS EXISTS. Ali, 2026-09-05: "It should look almost identical to
 * enterprise but filtered, colored, etc... for this brand... It has to be it's
 * own live page per website." Before this, clicking a record on aiflotation.com
 * threw the reader onto enterprise.colaberry.ai - another company's logo, menu
 * and domain, halfway through their own site's story.
 *
 * ONE RENDERER, NOT ONE PER BRAND. training.colaberry.com is next, so this lives
 * in packages/ and every brand app receives it through `app-build`. Structure is
 * here; every colour is a CSS custom property the host maps to its own palette.
 * Three hand-written copies of this page would disagree within a month.
 *
 * THE ORDER OF THE PAGE IS THE SERVER'S DECISION, NEVER THIS FILE'S. The surface
 * profile ships a `sectionOrder`, and the two brands genuinely differ: AI
 * Flotation opens with architecture and what shipped, the way a delivery firm
 * talks; Enterprise opens with the situation, the way a consultancy does. This
 * walks the order it is handed. Hard-coding a sequence here would let a brand's
 * page quietly stop matching the lens it was published under.
 *
 * IT RENDERS ONLY WHAT THE PROJECTION CARRIES. Consent is resolved server-side
 * before anything arrives: an organisation is already a name, a descriptor or
 * absent, and contributors are already named or role-only. There is no client
 * decision about what may be shown, so this file cannot leak something a lens
 * was supposed to withhold - it never receives it.
 *
 * A MISSING RECORD IS A 404, NOT AN EMPTY PAGE. The API returns a byte-identical
 * 404 for "no such slug" and "not published on this surface", which is what
 * stops a reader probing one brand's shelf for another brand's records. This
 * shows the same not-found state for both, for the same reason.
 */
(function () {
  'use strict';

  var root = document.getElementById('cs-record');
  if (!root) return;

  var API = document.currentScript && document.currentScript.getAttribute('data-api');
  var SURFACE = (document.currentScript && document.currentScript.getAttribute('data-surface'))
    || 'enterprise';
  var INDEX_PATH = (document.currentScript && document.currentScript.getAttribute('data-index'))
    || '/results/';
  if (!API) return;

  /* The slug is the last non-empty path segment: /results/<slug>/ or
     /results/<slug>. Read from the PATH rather than a query string so the
     address a reader shares is the address the canonical declares. */
  function slugFromPath() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : '';
  }

  function el(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined && textContent !== null) node.textContent = textContent;
    return node;
  }

  /*
   * NARRATIVES ARE ARRAYS OF PARAGRAPHS, and handing one to `textContent`
   * silently joins it with commas: "...where the design effort went.,The effort
   * went into...". It renders, so nothing errors - it just reads as a typo in
   * the middle of the argument. Each element gets its own <p>.
   */
  function prose(value, className) {
    var parts = Array.isArray(value) ? value : (value ? [value] : []);
    parts = parts.filter(Boolean);
    if (!parts.length) return null;
    var wrap = el('div', 'cs-prose-group');
    parts.forEach(function (t) { wrap.appendChild(el('p', className || 'cs-prose', t)); });
    return wrap;
  }

  /* Slugs are how the taxonomy stores a value; they are not how a reader says
     it. `in_progress` and `governed-ai-remediation` on a customer-facing page
     read as a database leaking through the design. */
  var ACRONYMS = ['ai', 'sql', 'mfa', 'api', 'ui', 'ux', 'css', 'html', 'ci', 'cd', 'llm', 'sdk', 'mcp'];
  var BRANDS = { typescript: 'TypeScript', javascript: 'JavaScript', github: 'GitHub',
    postgresql: 'PostgreSQL', postgres: 'Postgres', nodejs: 'Node.js', openai: 'OpenAI',
    claude: 'Claude', vite: 'Vite' };
  function humanize(slug) {
    var words = String(slug == null ? '' : slug).split(/[-_\s]+/).filter(Boolean);
    if (!words.length) return String(slug == null ? '' : slug);
    var said = words.map(function (w) {
      var k = w.toLowerCase();
      if (BRANDS[k]) return BRANDS[k];
      return ACRONYMS.indexOf(k) >= 0 ? w.toUpperCase() : w;
    });
    var k0 = words[0].toLowerCase();
    var lead = (ACRONYMS.indexOf(k0) >= 0 || BRANDS[k0])
      ? said[0] : said[0].charAt(0).toUpperCase() + said[0].slice(1);
    return [lead].concat(said.slice(1)).join(' ');
  }

  function appendAll(parent, children) {
    children.filter(Boolean).forEach(function (c) { parent.appendChild(c); });
    return parent;
  }

  function list(items, render, className) {
    if (!items || !items.length) return null;
    var ul = el('ul', className || 'cs-list');
    items.forEach(function (item) {
      var li = render(item);
      if (li) ul.appendChild(li);
    });
    return ul.childNodes.length ? ul : null;
  }

  function section(id, heading, children) {
    var kept = children.filter(Boolean);
    // A heading over nothing reads as a rendering fault. A band with no content
    // is not printed at all - which is also how a lens stays honest about a
    // record that simply has nothing to say in that band.
    if (!kept.length) return null;
    var s = el('section', 'cs-band');
    s.setAttribute('data-band', id);
    if (heading) s.appendChild(el('h2', 'cs-band-title', heading));
    return appendAll(s, kept);
  }

  /* ------------------------------------------------------------- the bands --- */

  function metricCard(m) {
    var card = el('li', 'cs-metric');
    card.appendChild(el('p', 'cs-metric-value', m.valueDisplay));
    card.appendChild(el('p', 'cs-metric-label', m.label));
    if (m.verificationClass) card.appendChild(el('p', 'cs-verify', m.verificationClass));
    var rows = [
      ['Baseline', m.baseline], ['Unit', m.unit],
      ['Sample', m.sample], ['Methodology', m.methodology],
    ].filter(function (r) { return r[1]; });
    if (rows.length) {
      var dl = el('dl', 'cs-metric-context');
      rows.forEach(function (r) {
        var wrap = el('div');
        wrap.appendChild(el('dt', 'cs-term', r[0]));
        wrap.appendChild(el('dd', 'cs-value', r[1]));
        dl.appendChild(wrap);
      });
      card.appendChild(dl);
    }
    /* Limitations are printed, never trimmed. A figure whose caveat was dropped
       for space is a different claim from the one that was verified. */
    var limits = list(m.limitations, function (l) { return el('li', null, l); }, 'cs-limits');
    if (limits) {
      card.appendChild(el('p', 'cs-term', 'Limitations'));
      card.appendChild(limits);
    }
    return card;
  }

  var BANDS = {
    situation: function (c) {
      var s = c.situation;
      if (!s) return null;
      return section('situation', s.heading || 'The situation', [
        prose(s.body),
        s.goals && s.goals.length ? el('h3', 'cs-sub', 'What it had to do') : null,
        list(s.goals, function (g) { return el('li', null, g); }),
        s.constraints && s.constraints.length ? el('h3', 'cs-sub', 'What constrained it') : null,
        list(s.constraints, function (g) { return el('li', null, g); }),
      ]);
    },

    build: function (c) {
      return section('build', 'The build', [
        list(c.timeline, function (t) {
          var li = el('li', 'cs-timeline-item');
          li.appendChild(el('span', 'cs-timeline-date', t.date || ''));
          li.appendChild(el('span', 'cs-timeline-label', t.label));
          if (t.detail) li.appendChild(el('p', 'cs-timeline-detail', t.detail));
          return li;
        }, 'cs-timeline'),
      ]);
    },

    architecture: function (c) {
      var a = c.architecture;
      if (!a) return null;
      function chips(label, values) {
        if (!values || !values.length) return null;
        var wrap = el('div', 'cs-chipset');
        wrap.appendChild(el('h3', 'cs-sub', label));
        var ul = el('ul', 'cs-chips');
        values.forEach(function (v) { ul.appendChild(el('li', 'cs-chip', humanize(v))); });
        wrap.appendChild(ul);
        return wrap;
      }
      return section('architecture', 'What was built', [
        prose(a.narrative),
        chips('Stack', a.stack),
        chips('Capabilities', a.capabilities),
        chips('Integrations', a.integrations),
        chips('Data stores', a.dataStores),
      ]);
    },

    measurement: function (c) {
      var m = c.measurement;
      var metrics = (m && m.metrics) || [];
      return section('measurement', 'The measurement', [
        m ? prose(m.narrative) : null,
        metrics.length ? appendAll(el('ul', 'cs-metrics'), metrics.map(metricCard)) : null,
      ]);
    },

    roadmap: function (c) {
      return section('roadmap', 'What happened next', [
        list(c.roadmap, function (r) {
          var li = el('li', 'cs-roadmap-item');
          li.appendChild(el('span', 'cs-roadmap-status', r.status));
          li.appendChild(el('span', 'cs-roadmap-label', r.label));
          if (r.detail) li.appendChild(el('p', 'cs-roadmap-detail', r.detail));
          return li;
        }, 'cs-roadmap'),
      ]);
    },

    contributors: function (c) {
      return section('contributors', 'Who built it', [
        list(c.contributors, function (p) {
          // `displayMode` is the server's consent decision, already made. A
          // role-only contributor has no name in the payload to print.
          return el('li', 'cs-person', p.displayMode === 'named'
            ? p.displayName + ' — ' + p.role
            : p.role);
        }, 'cs-people'),
      ]);
    },

    artifacts: function (c) {
      var open = (c.artifacts || []).filter(function (a) { return a.access === 'open'; });
      return section('artifacts', 'Artifacts', [
        list(open, function (a) {
          var li = el('li', 'cs-artifact');
          var img = a.previewUrl || a.url;
          if (img) {
            var picture = document.createElement('img');
            picture.src = img;
            picture.alt = a.title;
            picture.loading = 'lazy';
            li.appendChild(picture);
          }
          li.appendChild(el('p', 'cs-artifact-title', a.title));
          if (a.description) li.appendChild(el('p', 'cs-artifact-note', a.description));
          return li;
        }, 'cs-artifacts'),
      ]);
    },

    repositories: function (c) {
      return section('repositories', 'Repositories', [
        list(c.repositories, function (r) {
          var li = el('li', 'cs-repo');
          var a = document.createElement('a');
          a.href = r.url;
          a.rel = 'noreferrer';
          a.target = '_blank';
          a.textContent = r.label;
          li.appendChild(a);
          if (r.lastCommitDate) li.appendChild(el('span', 'cs-repo-date', r.lastCommitDate.slice(0, 10)));
          return li;
        }, 'cs-repos'),
      ]);
    },
  };

  /* ------------------------------------------------------------------ hero --- */

  function hero(c, surface) {
    var head = el('header', 'cs-hero');
    var copy = el('div', 'cs-hero-copy');
    copy.appendChild(el('p', 'cs-eyebrow', (surface && surface.hero && surface.hero.eyebrow) || ''));
    copy.appendChild(el('h1', 'cs-title', c.title));
    if (c.standfirst) copy.appendChild(el('p', 'cs-standfirst', c.standfirst));
    if (c.verificationClass) copy.appendChild(el('p', 'cs-verify', c.verificationClass));
    var back = document.createElement('a');
    back.className = 'cs-back';
    back.href = INDEX_PATH;
    back.textContent = 'All published records';
    copy.appendChild(back);
    head.appendChild(copy);

    /* The cover, beside the words rather than above them: it costs no vertical
       space in the masthead and sits next to the standfirst that explains it.
       Only an approved artifact's URL is ever used, and its own title is the
       alt text - an image nobody can describe does not go on the page. */
    var owner = (c.artifacts || []).filter(function (a) {
      return a.access === 'open' && (a.url === c.heroImageUrl || a.previewUrl === c.heroImageUrl);
    })[0];
    if (c.heroImageUrl && owner) {
      var fig = el('figure', 'cs-cover');
      var img = document.createElement('img');
      img.src = c.heroImageUrl;
      img.alt = owner.title;
      fig.appendChild(img);
      head.appendChild(fig);
    }
    return head;
  }

  function facts(c) {
    /* The third element says whether the value is a SLUG. Published is a date and
       an organisation is a name a human already wrote - humanising either would
       corrupt it, so only the taxonomy values are converted. */
    var rows = [
      ['Organisation', c.organizationLabel, false], ['Industry', c.industry, true],
      ['Capability', c.primaryCapability, true], ['Status', c.productionStatus, true],
      ['Built by', c.builtBy, true], ['Published', (c.publishedAt || '').slice(0, 10), false],
    ].filter(function (r) { return r[1]; });
    if (!rows.length) return null;
    var dl = el('dl', 'cs-facts');
    rows.forEach(function (r) {
      var wrap = el('div', 'cs-fact');
      wrap.appendChild(el('dt', 'cs-term', r[0]));
      wrap.appendChild(el('dd', 'cs-value', r[2] ? humanize(r[1]) : String(r[1])));
      dl.appendChild(wrap);
    });
    return dl;
  }

  /* ------------------------------------------------------------------ load --- */

  function notFound() {
    root.innerHTML = '';
    var s = el('section', 'cs-notfound');
    s.appendChild(el('h1', 'cs-title', 'Record not found'));
    s.appendChild(el('p', 'cs-prose',
      'This record is not published here. It may have been withdrawn, or it may live on another site.'));
    var back = document.createElement('a');
    back.className = 'cs-back';
    back.href = INDEX_PATH;
    back.textContent = 'All published records';
    s.appendChild(back);
    root.appendChild(s);
  }

  var slug = slugFromPath();
  if (!slug) { notFound(); return; }

  fetch(API + '/api/public/case-studies/' + encodeURIComponent(slug)
        + '?surface=' + encodeURIComponent(SURFACE), { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (body) {
      if (!body || !body.caseStudy) { notFound(); return; }
      var c = body.caseStudy;
      var surface = body.surface;

      document.title = (c.seo && c.seo.title) || c.title;
      var desc = document.querySelector('meta[name="description"]');
      if (desc && c.seo && c.seo.description) desc.setAttribute('content', c.seo.description);
      /* The canonical the SERVER derived for this surface. Written rather than
         assumed: this brand's page must not declare another brand's address. */
      if (c.seo && c.seo.canonicalUrl) {
        var link = document.querySelector('link[rel="canonical"]') || document.createElement('link');
        link.setAttribute('rel', 'canonical');
        link.setAttribute('href', c.seo.canonicalUrl);
        if (!link.parentNode) document.head.appendChild(link);
      }

      root.innerHTML = '';
      root.appendChild(hero(c, surface));
      var f = facts(c);
      if (f) root.appendChild(f);

      var order = (surface && surface.sectionOrder) || [];
      order.forEach(function (band) {
        if (band === 'hero' || band === 'cta') return;
        var render = BANDS[band];
        if (!render) return;
        var node = render(c);
        if (node) root.appendChild(node);
      });
    })
    .catch(function () { notFound(); });
})();
