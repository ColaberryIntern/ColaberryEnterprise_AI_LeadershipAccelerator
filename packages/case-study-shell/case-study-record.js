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

  /* "2026-04-28" as "28 Apr 2026", read out of the string and never through
     `new Date()`, which parses a bare date as UTC midnight and so prints the
     day before in any negative-offset timezone. Anything unparseable prints
     as sent. Same rule as the other two renderers. */
  var RAIL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
    if (!m) return String(iso == null ? '' : iso);
    var month = RAIL_MONTHS[Number(m[2]) - 1];
    return month ? Number(m[3]) + ' ' + month + ' ' + m[1] : iso;
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

  /* See the UNIT row in `metricCard`.

     Word sets rather than a built RegExp: the unit is record data, so escaping
     it into a pattern is a needless place for a `%` or a `.` to change the
     meaning of the match. Splitting both sides on non-word characters gives the
     same whole-word test with nothing to escape. Every word of the unit must
     appear, so "percentage points" is only redundant when BOTH do. */
  function unitWords(text) {
    return String(text || '').toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
  }

  function unitAlreadyInValue(valueDisplay, unit) {
    var wanted = unitWords(unit);
    if (!wanted.length) return false;
    var present = unitWords(valueDisplay);
    return wanted.every(function (w) { return present.indexOf(w) >= 0; });
  }

  function metricCard(m) {
    var card = el('li', 'cs-metric');
    card.appendChild(el('p', 'cs-metric-value', m.valueDisplay));
    card.appendChild(el('p', 'cs-metric-label', m.label));
    if (m.verificationClass) card.appendChild(el('p', 'cs-verify', m.verificationClass));
    /* The UNIT row is dropped when `valueDisplay` already says the unit,
       because otherwise the card says it twice: "14 decision records" above a
       row reading UNIT: records. MEASURED, not suspected - 13 of the 14 metrics
       published across the three live records do this, so it is a property of
       display values that read as complete phrases rather than fourteen
       separate authoring slips. Word-boundary matched, so a unit that genuinely
       adds something ("41%" with unit "percentage points") still prints. */
    var rows = [
      ['Baseline', m.baseline],
      ['Unit', unitAlreadyInValue(m.valueDisplay, m.unit) ? '' : m.unit],
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

  /* ============================ FIGURES IN THE ARTICLE =======================
     Ali, 2026-09-08, looking at a record whose three artifacts sat unused in a
     band at the bottom: "use the artifact pictures within the scope of the
     article... They would def have to be bigger though."

     A PORT of the Enterprise rules in
     `frontend/src/pages/publicV2/storyFigurePlacement.ts`, deliberately
     unchanged, so the same record does not read as two different arguments on
     two brands.

     BETWEEN SECTIONS, NOT INSIDE THEM. A figure inside "The measurement" is
     captioned by that heading whether anyone wrote a caption or not; between
     two sections it belongs to neither and claims only what its own caption
     says.
     ======================================================================== */

  var IMAGE_ARTIFACT_TYPES = ['screenshot', 'architecture', 'photo'];
  var FIGURE_GAP_SECTIONS = ['situation', 'build', 'architecture', 'measurement', 'roadmap', 'contributors'];
  /* Each of these ends on something the record claims to have proved, and an
     atmosphere photograph directly beneath one borrows its authority. */
  var ATMOSPHERE_EXCLUDED_AFTER = ['architecture', 'measurement', 'roadmap', 'contributors'];

  function figureAllowedAfter(a, section) {
    if (FIGURE_GAP_SECTIONS.indexOf(section) < 0) return false;
    if (a.presentation === 'atmosphere') return ATMOSPHERE_EXCLUDED_AFTER.indexOf(section) < 0;
    return true;
  }

  /* Returns { after: {section: [artifact]}, placed: [url] }.
     THE CONSTRAINED KIND GOES FIRST: atmosphere can use a subset of the gaps
     evidence can, so allocating in record order lets an evidence image take the
     one gap a photograph could have used and strand it. */
  function placeFigures(artifacts, order, excludeUrl) {
    var usable = (artifacts || []).filter(function (a) {
      var url = a.previewUrl || a.url;
      return a.access === 'open' && url && url !== excludeUrl
        && IMAGE_ARTIFACT_TYPES.indexOf(a.artifactType) >= 0;
    });
    var gaps = (order || []).filter(function (k) { return FIGURE_GAP_SECTIONS.indexOf(k) >= 0; });
    var after = {}, placed = [], taken = {};
    if (!usable.length || !gaps.length) return { after: after, placed: placed };

    function assign(a) {
      for (var i = 0; i < gaps.length; i += 1) {
        var gap = gaps[i];
        if (taken[gap]) continue;
        if (!figureAllowedAfter(a, gap)) continue;
        taken[gap] = true;
        after[gap] = (after[gap] || []).concat([a]);
        placed.push(a.previewUrl || a.url);
        return;
      }
    }
    usable.forEach(function (a) { if (a.presentation === 'atmosphere') assign(a); });
    usable.forEach(function (a) { if (a.presentation !== 'atmosphere') assign(a); });
    return { after: after, placed: placed };
  }

  /* Full width, and that is the point of the change - these used to be thumbnails
     three-across in a trailing band. */
  function figureNode(a) {
    var fig = el('figure', 'cs-figure');
    var img = document.createElement('img');
    img.src = a.previewUrl || a.url;
    img.alt = a.title;
    img.loading = 'lazy';
    fig.appendChild(img);
    var cap = el('figcaption');
    if (a.title) cap.appendChild(el('strong', null, a.title));
    if (a.description) cap.appendChild(el('span', null, a.description));
    fig.appendChild(cap);
    return fig;
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

    /*
     * THE BUILD AS A HORIZONTAL RAIL, not a vertical list. Ali, 2026-09-17,
     * on the training page first and then on this one: the dated list took a
     * screen and a half ("the timeline is not on the aiflotation side ... it
     * doesn't have a timeline and bottom format"). One dot per entry with the
     * labels staggered above and below, the details folded underneath, and the
     * same steps as plain rows under 900px so nothing ever overflows. Same
     * structure as the training site's `Rail`; this stylesheet's tokens.
     */
    build: function (c) {
      var entries = c.timeline || [];
      if (!entries.length) return null;
      var ol = el('ol', 'cs-rail');
      ol.style.setProperty('--cs-rail-n', String(entries.length));
      entries.forEach(function (t, i) {
        var li = el('li', 'cs-rail__item');
        li.setAttribute('data-side', i % 2 === 0 ? 'up' : 'down');
        li.style.setProperty('--cs-rail-i', String(i + 1));
        var dot = el('span', 'cs-rail__dot');
        dot.setAttribute('aria-hidden', 'true');
        li.appendChild(dot);
        var label = el('div', 'cs-rail__label');
        if (t.date) {
          var time = el('time', null, shortDate(t.date));
          time.setAttribute('datetime', t.date);
          label.appendChild(time);
        }
        label.appendChild(el('span', null, t.label));
        li.appendChild(label);
        ol.appendChild(li);
      });
      var detailed = entries.filter(function (t) { return t.detail; });
      var notes = null;
      if (detailed.length) {
        notes = el('details', 'cs-measure-fold');
        notes.setAttribute('data-testid', 'story-build-notes');
        notes.appendChild(el('summary', null, 'Notes on ' + detailed.length + ' of the ' + entries.length + ' steps'));
        var ul = el('ul', 'cs-rail__notes');
        detailed.forEach(function (t) {
          var li2 = el('li');
          li2.appendChild(el('strong', null, t.label + '.'));
          li2.appendChild(document.createTextNode(' ' + t.detail));
          ul.appendChild(li2);
        });
        notes.appendChild(ul);
      }
      return section('build', 'The build', [ol, notes]);
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
      /*
       * THE CHART, AS A PICTURE, BECAUSE THIS SHELL CANNOT DRAW ONE.
       *
       * `architecture.diagramSource` is mermaid text. The Colaberry Enterprise
       * app renders it live by importing mermaid from a CDN at runtime; this
       * shell is dependency-free vanilla JavaScript on purpose, so it has
       * nothing to render mermaid WITH. For a long time it simply dropped the
       * field: the source arrived in the payload on every record that had one,
       * and the band printed prose and chips with no chart at all.
       *
       * `diagramImageUrl` is that same chart, rendered ahead of time from this
       * record's own source by `scripts/renderCaseStudyDiagram.js` and served
       * from the platform. An `img` needs no library, so it is the one form
       * this shell can show.
       *
       * The URL has already been through `safeHttpUrl` server-side. It is set
       * here with `setAttribute` on an element that is only ever an `img`, so
       * there is no path from this value to script execution even if that gate
       * were to change.
       */
      function diagram(url, source) {
        if (!url || !source) return null;
        var fig = el('figure', 'cs-diagram');
        var img = el('img', 'cs-diagram-img');
        img.setAttribute('src', url);
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        // A diagram with no description is unreadable to a screen reader, and
        // "diagram" alone tells nobody anything.
        img.setAttribute('alt', 'Architecture diagram for ' + (c.title || 'this record'));
        fig.appendChild(img);
        fig.appendChild(el('figcaption', 'cs-diagram-caption',
          'A diagram the delivery team drew.'));
        return fig;
      }

      /* The first paragraph and the stack stand; the rest folds. Everything
         below the decisions had to shrink, and nothing may be trimmed to do
         it: the full text is one click away, never cut. */
      var narrative = (a.narrative || []).filter(Boolean);
      var rest = narrative.slice(1);
      var extra = [prose(rest), chips('Capabilities', a.capabilities), chips('Integrations', a.integrations), chips('Data stores', a.dataStores)].filter(Boolean);
      var more = null;
      if (extra.length) {
        more = el('details', 'cs-measure-fold');
        more.setAttribute('data-testid', 'story-architecture-more');
        more.appendChild(el('summary', null, 'More on what was built'));
        var body = el('div', 'cs-fold-body');
        extra.forEach(function (node) { body.appendChild(node); });
        more.appendChild(body);
      }
      return section('architecture', 'What was built', [
        prose(narrative.slice(0, 1)),
        chips('Stack', a.stack),
        more,
        diagram(a.diagramImageUrl, a.diagramSource),
      ]);
    },

    measurement: function (c) {
      var m = c.measurement;
      var metrics = (m && m.metrics) || [];
      var cards = metrics.length ? appendAll(el('ul', 'cs-metrics'), metrics.map(metricCard)) : null;
      /* WHEN THE VISUAL STORY ALREADY SHOWS THE FIGURES, the cards fold. Ali,
         2026-09-16, on the Enterprise pilot: "Shouldn't the new cards replace
         the old cards? I don't think they both need to be there." The full
         notes (baseline, sample, methodology, limitations) stay one click
         away; the same figures are not printed twice on one page. */
      if (cards && storyShowsFigures(c)) {
        var fold = el('details', 'cs-measure-fold');
        fold.setAttribute('data-testid', 'story-measurement-notes');
        fold.appendChild(el('summary', null, 'Full notes on all ' + metrics.length + ' metric' + (metrics.length === 1 ? '' : 's')));
        fold.appendChild(cards);
        cards = fold;
      }
      return section('measurement', 'The measurement', [m ? prose(m.narrative) : null, cards]);
    },

    /*
     * WHAT HAPPENED NEXT AS A STATUS BOARD: one column per status in the order
     * the record lists them, labels only, the details folded. The list form
     * printed a status word, a label and a paragraph per item and ran a
     * thousand pixels; the board says the same thing in a glance. `not_pursued`
     * is how the taxonomy stores it, never how a reader says it, so the heading
     * is humanised.
     */
    roadmap: function (c) {
      var items = c.roadmap || [];
      if (!items.length) return null;
      var statuses = [];
      items.forEach(function (r) {
        var s = r.status || 'other';
        if (statuses.indexOf(s) < 0) statuses.push(s);
      });
      var board = el('div', 'cs-next');
      statuses.forEach(function (status) {
        var group = el('div', 'cs-next__group');
        group.setAttribute('data-status', status);
        group.appendChild(el('h3', 'cs-term', status === 'other' ? 'Other' : humanize(status)));
        var ul = el('ul', 'cs-next__list');
        items.filter(function (r) { return (r.status || 'other') === status; })
          .forEach(function (r) { ul.appendChild(el('li', null, r.label)); });
        group.appendChild(ul);
        board.appendChild(group);
      });
      var detailed = items.filter(function (r) { return r.detail; });
      var notes = null;
      if (detailed.length) {
        notes = el('details', 'cs-measure-fold');
        notes.setAttribute('data-testid', 'story-roadmap-notes');
        notes.appendChild(el('summary', null, 'Notes on ' + detailed.length + ' of the ' + items.length + ' items'));
        var ul2 = el('ul', 'cs-rail__notes');
        detailed.forEach(function (r) {
          var li = el('li');
          li.appendChild(el('strong', null, r.label + '.'));
          li.appendChild(document.createTextNode(' ' + r.detail));
          ul2.appendChild(li);
        });
        notes.appendChild(ul2);
      }
      return section('roadmap', 'What happened next', [board, notes]);
    },

    /* The story sections (2026-09-17): the decision cards, Meet the builder
       and the closing, placed by the surface profile. Everything printed is
       the projection's word: a null builder name credits the role, and no
       biography or link is invented for it. Same parts, same order as the
       other sites; this stylesheet's tokens. */
    decisions: function (c) {
      var cards = (c.decisions || []).filter(function (d) {
        return d && d.title && d.problem && d.decision && d.evidence && d.consequence;
      });
      if (!cards.length) return null;
      var pinned = cards.every(function (d) { return d.stage; });
      var count = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' }[cards.length] || String(cards.length);
      var lead = el('p', 'cs-decisions__lead', (cards.length === 1 ? 'One choice shaped the system.' : count + ' choices shaped the system.')
        + (pinned ? (cards.length === 1 ? ' It lives at a specific point in the drawing above.' : ' Each one lives at a specific point in the drawing above.') : ''));
      var ol = el('ol', 'cs-decisions__list');
      cards.forEach(function (d, i) {
        var li = el('li', 'cs-decision');
        var top = el('div', 'cs-decision__top');
        var index = el('span', 'cs-decision__index', String(i + 1));
        index.setAttribute('aria-hidden', 'true');
        top.appendChild(index);
        if (d.stage) top.appendChild(el('span', 'cs-decision__stage', 'At ' + d.stage));
        li.appendChild(top);
        li.appendChild(el('h3', 'cs-decision__title', d.title));
        li.appendChild(el('p', 'cs-decision__text', d.problem));
        li.appendChild(el('p', 'cs-decision__text', d.decision));
        var ev = el('p', 'cs-decision__evidence');
        ev.appendChild(el('span', 'cs-term', 'Evidence'));
        ev.appendChild(document.createTextNode(' ' + d.evidence));
        li.appendChild(ev);
        var out = el('p', 'cs-decision__outcome');
        if (d.figure) out.appendChild(el('strong', 'cs-decision__figure', d.figure));
        out.appendChild(el('span', null, d.consequence));
        li.appendChild(out);
        ol.appendChild(li);
      });
      var s = section('decisions', 'Decisions that made the difference', [lead, ol]);
      if (s) { s.classList.add('cs-decisions'); s.setAttribute('data-testid', 'story-decisions'); }
      return s;
    },

    builder: function (c) {
      var b = c.builder;
      if (!b || !b.roleTitle || !b.contribution) return null;
      var card = el('div', 'cs-builder__card');
      var who = el('div', 'cs-builder__who');
      var head = el('div', 'cs-builder__head');
      if (b.photoUrl) {
        var img = el('img', 'cs-builder-photo');
        img.src = b.photoUrl;
        img.alt = b.name || b.roleTitle;
        head.appendChild(img);
      } else {
        var mark = el('span', 'cs-builder-mark', b.initials || (b.name ? b.name.charAt(0) : ''));
        mark.setAttribute('aria-hidden', 'true');
        head.appendChild(mark);
      }
      var names = el('div');
      names.appendChild(el('p', 'cs-builder__name', b.name || b.roleTitle));
      if (b.name) names.appendChild(el('p', 'cs-builder__role', b.organization ? b.roleTitle + ', ' + b.organization : b.roleTitle));
      head.appendChild(names);
      who.appendChild(head);
      var steps = b.progression || [];
      if (steps.length) {
        var rail = el('ol', 'cs-builder__progression');
        rail.setAttribute('aria-label', 'Career progression');
        steps.forEach(function (step, i) {
          var li = el('li', null, step);
          li.setAttribute('data-current', i === steps.length - 1 ? 'true' : 'false');
          rail.appendChild(li);
        });
        who.appendChild(rail);
      }
      who.appendChild(el('p', 'cs-term', 'Project contribution'));
      who.appendChild(el('p', 'cs-builder__contribution', b.contribution));
      if (b.profileUrl) {
        var link = el('a', 'cs-back', 'Approved profile');
        link.href = b.profileUrl;
        link.rel = 'noopener';
        who.appendChild(link);
      }
      card.appendChild(who);
      var skills = (b.skills || []).filter(function (sk) { return sk && sk.label && sk.evidence; });
      if (skills.length) {
        var did = el('div', 'cs-builder__did');
        did.appendChild(el('p', 'cs-term', 'Skills demonstrated'));
        var ul = el('ul', 'cs-builder__skills');
        skills.forEach(function (sk) {
          var li = el('li', 'cs-builder__skill');
          li.appendChild(el('strong', null, sk.label));
          li.appendChild(el('span', null, sk.evidence));
          ul.appendChild(li);
        });
        did.appendChild(ul);
        card.appendChild(did);
      }
      var source = b.provenance && b.provenance.source;
      var line = source === 'approved_profile'
        ? 'From an approved profile; project contribution from the repository record.'
        : source === 'repository' ? 'From the repository record.'
          : 'Career facts as confirmed to Colaberry; project contribution from the repository record.';
      var s = section('builder', 'Meet the builder', [card, el('p', 'cs-builder__provenance', line)]);
      if (s) { s.classList.add('cs-builder'); s.setAttribute('data-testid', 'story-builder'); }
      return s;
    },

    closing: function (c) {
      if (!c.closing) return null;
      var s = section('closing', 'What this project shows', [el('p', 'cs-prose cs-closing__text', c.closing)]);
      if (s) { s.classList.add('cs-closing'); s.setAttribute('data-testid', 'story-closing'); }
      return s;
    },

    contributors: function (c) {
      // Stands down when the builder card already names the only contributor:
      // the card is the credit.
      var only = (c.contributors || []).length === 1 ? c.contributors[0] : null;
      if (c.builder && c.builder.name && only && only.displayMode === 'named' && only.displayName === c.builder.name && !(c.anonymousContributorCount > 0)) return null;
      return section('contributors', 'Who built it', [
        list(c.contributors, function (p) {
          // `displayMode` is the server's consent decision, already made. A
          // role-only contributor has no name in the payload to print. A named
          // one reads "Kes, AI Systems Architect ...": the name in bold, then
          // the role, joined by a comma (published copy carries no dashes).
          if (p.displayMode !== 'named') return el('li', 'cs-person', p.role);
          var li = el('li', 'cs-person');
          li.appendChild(el('strong', 'cs-person__name', p.displayName));
          li.appendChild(document.createTextNode(', ' + p.role));
          return li;
        }, 'cs-people'),
      ]);
    },

    artifacts: function (c, placed) {
      /* WHAT IS LEFT. A picture already met in the article does not appear
         again, and the COVER counts as already met - excluding it only from the
         gaps still let it return here, which is the same repeat one band lower.
         When everything found a home this band renders nothing, which is right:
         it exists to show what the reader has not already seen. */
      var seen = (placed || []).concat(c.heroImageUrl ? [c.heroImageUrl] : []);
      var open = (c.artifacts || []).filter(function (a) {
        return a.access === 'open' && seen.indexOf(a.previewUrl || a.url) < 0;
      });
      if (!open.length) return null;
      return section('artifacts', 'More from this project', [
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
    /* WHEN THERE IS A WALKTHROUGH, THE PICTURE SLOT IS THE PLAYER. Ali: "shouldn't the
       video be in the hero section?" - and the band this replaced opened a record with two
       visuals doing the same job, a screenshot of the product then a film of it, with the
       reader scrolling past the first to reach the second. The poster falls back to the
       cover, so the masthead looks unchanged until somebody presses play. */
    var player = walkthrough(c, c.heroImageUrl && owner ? c.heroImageUrl : null);
    if (player) {
      head.appendChild(player);
    } else if (c.heroImageUrl && owner) {
      var fig = el('figure', 'cs-cover');
      var img = document.createElement('img');
      img.src = c.heroImageUrl;
      img.alt = owner.title;
      fig.appendChild(img);
      head.appendChild(fig);
    }
    return head;
  }

  /* ============================ THE VISUAL STORY =============================
     Ali, 2026-09-16, on the Enterprise pilot: "They need to be done for all the
     published sites." The band (workflow drawing, outcome cards with their
     count-up, charts) is `case-study-visual-story.js`, framework-free and
     loaded before this file; it mounts under the facts, above the first band,
     exactly where the Enterprise page puts it. A page that did not load the
     band's scripts renders the record as before: the story is an extra on the
     wire, never a dependency of the record.
     ======================================================================== */

  function visualStoryModule() {
    return typeof window !== 'undefined' && window.CaseStudyVisualStory ? window.CaseStudyVisualStory : null;
  }

  function storyShowsFigures(c) {
    var mod = visualStoryModule();
    return Boolean(mod && c.visualStory && mod.showsFigures(c.visualStory));
  }

  /* Mounted AFTER `host` is in the document, so the drawing can measure the
     width it is given and fit it rather than guess from the viewport. */
  function mountVisualStory(host, c) {
    var mod = visualStoryModule();
    var mounted = mod.mount(host, c.visualStory, {
      onInteraction: function (visual, action) {
        if (typeof window.rfxTrack === 'function') window.rfxTrack('case_study_visual_interaction', { slug: c.slug, visual: visual, action: action });
      },
    });
    if (!mounted && host.parentNode) host.parentNode.removeChild(host);
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


  /*
   * THE NARRATED WALKTHROUGH, IN THE MASTHEAD'S PICTURE SLOT.
   *
   * A native `video` rather than an embed: the platform serves the file, so no third party
   * is handed a record of who watched a client's delivery, and this domain sends no CSP at
   * all so there is nothing to widen either way.
   *
   * Not autoplayed and `preload="none"`. It carries narration - a page that starts talking
   * at a reader is a page they leave - and a several-megabyte file should not be fetched by
   * every visitor who never presses play.
   *
   * The `track` is the accessible copy of captions the picture already carries burned in;
   * burned-in text cannot be resized, translated, turned off or read by a screen reader.
   */
  function walkthrough(c, posterFallback) {
    var v = c.walkthroughVideo;
    if (!v) return null;

    /* AN OPERATOR'S OWN VIDEO REPLACES THE GENERATED ONE, and it plays through a
       different element: a provider embed is an <iframe> the provider owns, not a
       <video> this platform controls.

       Everything the file version does below is therefore skipped rather than
       adapted. There is no `source`, because the bytes are not ours. There is no
       caption `track`, because captions belong to the uploader and attaching our
       narration's VTT would caption someone else's video with our script. There is
       no `crossorigin`, because we are not reading the media. And the synthetic-voice
       note is not printed, because this narration is a human's and claiming
       otherwise would be the exact deception that note exists to prevent.

       `embedUrl` is produced and re-checked server-side by `videoEmbed.ts` against a
       host allowlist; both surfaces already permit these origins in `frame-src`. */
    if (v.embedUrl) {
      var efig = el('figure', 'cs-cover cs-cover--video cs-cover--embed');
      var frame = document.createElement('iframe');
      frame.className = 'cs-walkthrough-embed';
      frame.setAttribute('src', v.embedUrl);
      frame.setAttribute('title', v.title || 'Walkthrough');
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('allow', 'accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen');
      frame.setAttribute('allowfullscreen', '');
      efig.appendChild(frame);
      var cap = el('figcaption', 'cs-walkthrough-note', v.title || 'Walkthrough');
      if (v.watchUrl) {
        cap.appendChild(document.createTextNode(' '));
        var a = document.createElement('a');
        a.href = v.watchUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = v.provider === 'vimeo' ? 'Watch on Vimeo' : 'Watch on YouTube';
        cap.appendChild(a);
      }
      efig.appendChild(cap);
      return efig;
    }

    if (!v.url) return null;
    var fig = el('figure', 'cs-cover cs-cover--video');
    var video = document.createElement('video');
    video.className = 'cs-walkthrough-player';
    video.setAttribute('controls', '');
    video.setAttribute('preload', 'none');
    video.setAttribute('playsinline', '');
    // Required for the CAPTIONS, not the video. A cross-origin `track` is refused unless
    // the media element itself is a CORS request, and this page is on another brand's
    // domain while the file is served from the platform. Without it the track's
    // readyState goes to 3 (ERROR) and the cue list stays empty while the video plays
    // fine — nothing looks broken except the missing captions.
    video.setAttribute('crossorigin', 'anonymous');
    var poster = v.posterUrl || posterFallback;
    if (poster) video.setAttribute('poster', poster);
    var src = document.createElement('source');
    src.setAttribute('src', v.url);
    src.setAttribute('type', 'video/mp4');
    video.appendChild(src);
    if (v.captionsUrl) {
      var track = document.createElement('track');
      track.setAttribute('kind', 'captions');
      track.setAttribute('srclang', 'en');
      track.setAttribute('label', 'English');
      track.setAttribute('src', v.captionsUrl);
      /* NOT `default`, and that is the whole fix for a doubled read-over.
         `build_video.py` BURNS the narration into the picture - deliberately, it
         is what the reference clip does - and this sidecar is the ACCESSIBLE
         COPY of the same sentences, for a screen reader, a translation or a
         reader who wants them larger. Marking it `default` made the browser
         paint those words a second time, in its own black bar, directly over a
         frame that already said them. Shipped, so it was on two live records.
         The track stays: it is reachable from the player's CC control and by
         assistive technology, which is what it was written for. */
      video.appendChild(track);
    }
    fig.appendChild(video);
    // Labelled, not left to be assumed. An unlabelled synthetic voice is a small
    // deception, and this system's whole claim is that it does not make those.
    fig.appendChild(el('figcaption', 'cs-walkthrough-note',
      v.narrationSource === 'synthetic'
        ? (v.title || 'Walkthrough') + '. Narrated by a synthetic voice; the figures it '
          + 'states are the verified metrics recorded below.'
        : (v.title || 'Walkthrough')));
    return fig;
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

  /* ====================== KEEP READING: OTHER RECORDS ========================
     Ali, 2026-09-08: "show other related project at the end of the Case Study's
     so they can continue looking through related case studys. This should be at
     the bottom and only include Case Studys that can be shown on their
     respective site."

     THE SURFACE IS THE FILTER, and it is the server's, not a guess made here.
     The same list endpoint the index uses is asked for THIS surface, so a
     record that is not published to this brand cannot appear - which is the
     whole of "only Case Studys that can be shown on their respective site".

     Fetched SEPARATELY and appended when it arrives. The record must not wait
     on it: if this request is slow or fails, the reader still gets the record,
     and the page simply ends where it used to.
     ======================================================================== */

  function relatedBand(items, currentSlug) {
    var others = (items || []).filter(function (r) { return r.slug !== currentSlug; });
    if (!others.length) return null;
    /* Three at most. This is an invitation to keep reading, not a second index -
       the index is one click away and is where a reader goes to browse. */
    others = others.slice(0, 3);

    var sec = el('section', 'cs-band cs-related');
    sec.id = 'related';
    sec.appendChild(el('h2', 'cs-band-title', 'Keep reading'));
    var ul = el('ul', 'cs-related-list');
    others.forEach(function (r) {
      var li = el('li', 'cs-related-item');
      var a = document.createElement('a');
      a.className = 'cs-related-link';
      a.href = INDEX_PATH.replace(/\/+$/, '') + '/' + encodeURIComponent(r.slug) + '/';
      if (r.heroImageUrl) {
        var img = document.createElement('img');
        img.src = r.heroImageUrl;
        /* Decorative: the title is in the same link, so announcing both would
           read the record's name twice. */
        img.alt = '';
        img.loading = 'lazy';
        a.appendChild(img);
      }
      /* THE SAME CARD AS THE INDEX, not a smaller cousin. Ali, 2026-09-09:
         "All the cards should be the same size." Same blocks in the same order
         - meta, title, standfirst, who built it, verification and the
         affordance - so the two grids hold one object rather than two that
         merely resemble each other. */
      var body = el('div', 'cs-related-body');
      if (r.primaryCapability) body.appendChild(el('p', 'cs-related-meta', humanize(r.primaryCapability)));
      body.appendChild(el('h3', 'cs-related-title', r.title));
      if (r.standfirst) body.appendChild(el('p', 'cs-related-note', r.standfirst));
      var builder = r.builtBy ? humanize(r.builtBy) : r.organizationLabel;
      if (builder) body.appendChild(el('p', 'cs-related-builder', 'Built by ' + builder));
      var foot = el('div', 'cs-related-foot');
      foot.appendChild(el('span', 'cs-related-verify', r.verificationClass || ''));
      foot.appendChild(el('span', 'cs-related-cta', 'Read the record'));
      body.appendChild(foot);
      a.appendChild(body);
      li.appendChild(a);
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    return sec;
  }

  function appendRelated(currentSlug) {
    fetch(API + '/api/public/case-studies?surface=' + encodeURIComponent(SURFACE) + '&limit=4',
          { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        var band = body && relatedBand(body.items, currentSlug);
        if (band) root.appendChild(band);
      })
      .catch(function () { /* The record is already on the page. */ });
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
      if (visualStoryModule() && c.visualStory) {
        var storyHost = el('div', 'cs-visual-story-host');
        root.appendChild(storyHost);
        mountVisualStory(storyHost, c);
      }

      var order = (surface && surface.sectionOrder) || [];
      /* Placed against the order this page will actually render, so a figure
         can never land after a section the record does not have. */
      var figures = placeFigures(c.artifacts, order, c.heroImageUrl);
      order.forEach(function (band) {
        if (band === 'hero' || band === 'cta') return;
        var render = BANDS[band];
        if (!render) return;
        var node = render(c, figures.placed);
        if (!node) return;
        root.appendChild(node);
        (figures.after[band] || []).forEach(function (a) {
          root.appendChild(figureNode(a));
        });
      });

      /* Last, and asynchronously: the record is already readable, so a slow
         or failed list request costs the reader nothing. */
      appendRelated(c.slug);
    })
    .catch(function () { notFound(); });
})();
