/**
 * The published-records index on aiflotation.com/results.
 *
 * WHAT THIS IS AND IS NOT A COPY OF. Ali, 2026-09-05: it should work "the same
 * way it shows up on enterprise page with the word chart and filters to the
 * left". Same CAPABILITIES - a weighted word cloud, a filter sidebar, type-to-
 * filter search, shareable URLs. Not the same pixels: AI Flotation has its own
 * typeface, palette and navigation, and dressing it as Colaberry Enterprise
 * would undo the brand separation the surface system exists to keep.
 *
 * WHY IT IS VANILLA AND NOT THE REACT COMPONENT. This app declares zero
 * dependencies and `validate-app-boundaries.js` enforces that its only edges are
 * to packages/*. Mounting a React page here would make a marketing site into an
 * SPA and take a bundler with it.
 *
 * AND WHY DUPLICATING IT IS SAFE, WHICH IS THE PART WORTH CHECKING. Everything
 * load-bearing is SERVER-side and shared with the Enterprise page: which records
 * exist on this surface, what the facets are, how free text matches, and every
 * consent decision about what a card may say. This file renders what the API
 * returns and turns clicks into query parameters. If it drifts, it drifts in
 * presentation - it cannot show a record this surface has not published, and it
 * cannot reveal a name consent removed, because it never sees either.
 *
 * FAILURE MODE IS THE HONEST EMPTY PAGE. The markup ships with AI Flotation's
 * "we have nothing to show you here yet" already in it. This script only ever
 * upgrades that. A blocked script, an API outage or a parse error leaves a
 * reader on a page that says we have nothing - which on a site whose argument is
 * that it does not overstate is the only acceptable way to fail.
 */
(function () {
  'use strict';

  var API = document.currentScript && document.currentScript.getAttribute('data-api');
  var SURFACE = 'ai-flotation';
  var DEBOUNCE_MS = 250;

  /* Which facet groups become words, and in which order they are offered as
     filters. Verification and Built-by are two or three fixed values each and
     read as a control rather than a vocabulary, so they are not in the cloud. */
  var CLOUD_FIELDS = ['capability', 'stack', 'industry'];
  var FILTER_GROUPS = [
    { field: 'stack', param: 'stack', legend: 'Stack', facet: 'stack' },
    { field: 'capability', param: 'capability', legend: 'Capability', facet: 'capabilities' },
    { field: 'industry', param: 'industry', legend: 'Industry', facet: 'industries' },
  ];

  /* Acronyms and brands, so `governed-ai-remediation` reads as a phrase rather
     than a slug. Deliberately short: a display nicety, not a dictionary. */
  var ACRONYMS = ['ai', 'sql', 'mfa', 'api', 'ui', 'ux', 'css', 'html', 'ci', 'cd', 'llm', 'sdk', 'mcp'];
  var BRANDS = {
    typescript: 'TypeScript', javascript: 'JavaScript', github: 'GitHub',
    postgresql: 'PostgreSQL', postgres: 'Postgres', nodejs: 'Node.js',
    openai: 'OpenAI', claude: 'Claude', vite: 'Vite',
  };

  function humanize(slug) {
    var words = String(slug || '').split(/[-_\s]+/).filter(Boolean);
    if (!words.length) return String(slug || '');
    var said = words.map(function (w) {
      var k = w.toLowerCase();
      if (BRANDS[k]) return BRANDS[k];
      return ACRONYMS.indexOf(k) >= 0 ? w.toUpperCase() : w;
    });
    var firstKey = words[0].toLowerCase();
    var lead = (ACRONYMS.indexOf(firstKey) >= 0 || BRANDS[firstKey])
      ? said[0]
      : said[0].charAt(0).toUpperCase() + said[0].slice(1);
    return [lead].concat(said.slice(1)).join(' ');
  }

  /* ------------------------------------------------------------- elements --- */

  var el = {
    title: document.getElementById('results-title'),
    sub: document.getElementById('results-sub'),
    cloud: document.getElementById('results-cloud'),
    filters: document.getElementById('results-filters'),
    search: document.getElementById('results-q'),
    count: document.getElementById('results-count'),
    grid: document.getElementById('results-records'),
    empty: document.getElementById('results-empty'),
    why: document.getElementById('results-why-empty'),
    layout: document.getElementById('results-layout'),
  };
  if (!API || !el.grid || !el.empty) return;

  /* ---------------------------------------------------------------- state --- */

  /* The URL is the only place filter state lives, so back, forward, reload and a
     pasted link are correct by construction rather than by a sync effect. */
  function readState() {
    var p = new URLSearchParams(window.location.search);
    var state = { q: p.get('q') || '' };
    FILTER_GROUPS.forEach(function (g) {
      var raw = p.getAll(g.param).join(',');
      state[g.param] = raw ? raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean) : [];
    });
    return state;
  }

  function writeState(state, replace) {
    var p = new URLSearchParams();
    FILTER_GROUPS.forEach(function (g) {
      if (state[g.param] && state[g.param].length) p.set(g.param, state[g.param].join(','));
    });
    if (state.q) p.set('q', state.q);
    var url = window.location.pathname + (p.toString() ? '?' + p.toString() : '');
    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  }

  function toggle(state, param, value) {
    var list = state[param] || [];
    var at = list.indexOf(value);
    state[param] = at >= 0 ? list.slice(0, at).concat(list.slice(at + 1)) : list.concat([value]);
    return state;
  }

  var facets = null;
  var pending = null;

  /* ------------------------------------------------------------ rendering --- */

  function text(node, value) { node.textContent = value; return node; }

  function card(record) {
    var a = document.createElement('a');
    a.className = 'tile record';
    /* The detail page lives on the platform, not on this domain: these records
       are rendered from one canonical projection and `seo.canonicalUrl` points
       there. Linking anywhere else would mint a second address for one page. */
    a.href = API + '/stories/' + encodeURIComponent(record.slug);
    a.appendChild(text(document.createElement('h3'), record.title));
    if (record.standfirst) a.appendChild(text(document.createElement('p'), record.standfirst));
    if (record.verificationClass) {
      var v = text(document.createElement('span'), record.verificationClass);
      v.className = 'record-verify';
      a.appendChild(v);
    }
    return a;
  }

  function renderCloud(state) {
    if (!el.cloud || !facets) return;
    var terms = [];
    CLOUD_FIELDS.forEach(function (field) {
      var group = FILTER_GROUPS.filter(function (g) { return g.field === field; })[0];
      if (!group) return;
      (facets[group.facet] || []).forEach(function (f) {
        if (f.count > 0) terms.push({ field: field, param: group.param, slug: f.slug, count: f.count });
      });
    });
    /* Heaviest first, then alphabetical. Never shuffled: a cloud that reorders
       moves the word a reader was about to click out from under the cursor. */
    terms.sort(function (a, b) { return b.count - a.count || a.slug.localeCompare(b.slug); });
    el.cloud.innerHTML = '';
    if (!terms.length) { el.cloud.hidden = true; return; }
    el.cloud.hidden = false;

    var max = terms[0].count;
    var tiers = ['0.86rem', '0.98rem', '1.14rem', '1.34rem', '1.6rem'];

    var head = document.createElement('div');
    head.className = 'cloud-head';
    var heading = document.createElement('div');
    heading.appendChild(text(document.createElement('h3'), 'What is in here'));
    heading.appendChild(text(document.createElement('p'), 'Every word is a filter. Bigger means more records carry it.'));
    head.appendChild(heading);
    var key = document.createElement('ul');
    key.className = 'cloud-key';
    CLOUD_FIELDS.forEach(function (field) {
      if (!terms.some(function (t) { return t.field === field; })) return;
      var li = document.createElement('li');
      li.setAttribute('data-field', field);
      var sw = document.createElement('span');
      sw.className = 'cloud-swatch';
      sw.setAttribute('aria-hidden', 'true');
      li.appendChild(sw);
      li.appendChild(document.createTextNode(humanize(field)));
      key.appendChild(li);
    });
    head.appendChild(key);
    el.cloud.appendChild(head);

    var list = document.createElement('ul');
    list.className = 'cloud-terms';
    terms.forEach(function (t) {
      var on = (state[t.param] || []).indexOf(t.slug) >= 0;
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cloud-term';
      b.setAttribute('data-field', t.field);
      b.setAttribute('data-on', on ? 'true' : 'false');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var share = max > 0 ? t.count / max : 0;
      b.style.fontSize = tiers[Math.min(tiers.length - 1, Math.floor(share * tiers.length))];
      b.appendChild(document.createTextNode(humanize(t.slug)));
      var c = text(document.createElement('span'), ' ' + t.count);
      c.className = 'cloud-count';
      b.appendChild(c);
      b.addEventListener('click', function () {
        var next = toggle(readState(), t.param, t.slug);
        writeState(next);
        load(next);
      });
      li.appendChild(b);
      list.appendChild(li);
    });
    el.cloud.appendChild(list);
  }

  function renderFilters(state) {
    if (!el.filters || !facets) return;
    el.filters.innerHTML = '';
    var any = false;
    FILTER_GROUPS.forEach(function (g) {
      var options = (facets[g.facet] || []).filter(function (f) { return f.count > 0; });
      if (!options.length) return;
      any = true;
      var box = document.createElement('div');
      box.className = 'filter-group';
      box.appendChild(text(document.createElement('h3'), g.legend));
      options.forEach(function (f) {
        var id = 'f-' + g.param + '-' + f.slug;
        var row = document.createElement('label');
        row.className = 'filter-row';
        row.setAttribute('for', id);
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = (state[g.param] || []).indexOf(f.slug) >= 0;
        input.addEventListener('change', function () {
          var next = toggle(readState(), g.param, f.slug);
          writeState(next);
          load(next);
        });
        row.appendChild(input);
        row.appendChild(document.createTextNode(humanize(f.slug)));
        var n = text(document.createElement('span'), String(f.count));
        n.className = 'filter-count';
        row.appendChild(n);
        box.appendChild(row);
      });
      el.filters.appendChild(box);
    });
    el.filters.hidden = !any;
  }

  function renderRecords(body, state) {
    var items = (body && body.items) || [];
    el.grid.innerHTML = '';

    var filtering = !!state.q || FILTER_GROUPS.some(function (g) { return (state[g.param] || []).length; });

    if (!items.length) {
      el.grid.hidden = true;
      el.empty.hidden = false;
      /* Two different empty states, and conflating them is the classic mistake:
         "nothing published" is a fact about the library, "no match" is a fact
         about the reader's filters. */
      if (filtering) {
        var h = el.empty.querySelector('h3');
        var p = el.empty.querySelector('p');
        if (h) text(h, 'No published results match these filters.');
        if (p) text(p, 'Clear a filter or the search box to widen the list.');
        if (el.why) el.why.hidden = true;
      }
      if (el.count) text(el.count, filtering ? 'No matches.' : '');
      return;
    }

    el.empty.hidden = true;
    if (el.why) el.why.hidden = true;
    el.grid.hidden = false;
    items.forEach(function (r) { el.grid.appendChild(card(r)); });

    var total = typeof body.total === 'number' ? body.total : items.length;
    if (el.count) {
      text(el.count, 'Showing ' + total + ' published result' + (total === 1 ? '' : 's') + '.');
    }

    /* The masthead is rewritten from the SURFACE the server returned, never from
       a string typed here, so this page cannot claim a framing the record was
       not published under. */
    var hero = body.surface && body.surface.hero;
    if (hero && el.title && hero.title) text(el.title, hero.title);
    if (hero && el.sub && hero.description) text(el.sub, hero.description);
    if (el.layout) el.layout.hidden = false;
  }

  /* ----------------------------------------------------------------- load --- */

  function query(state) {
    var p = new URLSearchParams();
    p.set('surface', SURFACE);
    p.set('limit', '48');
    FILTER_GROUPS.forEach(function (g) {
      if ((state[g.param] || []).length) p.set(g.param, state[g.param].join(','));
    });
    if (state.q) p.set('q', state.q);
    return p.toString();
  }

  function load(state) {
    renderCloud(state);
    renderFilters(state);
    return fetch(API + '/api/public/case-studies?' + query(state), {
      headers: { Accept: 'application/json' },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) { if (body) renderRecords(body, state); })
      .catch(function () { /* The empty state is already on the page. */ });
  }

  /* ----------------------------------------------------------------- wire --- */

  var state = readState();

  if (el.search) {
    el.search.value = state.q;
    el.search.addEventListener('input', function () {
      var value = el.search.value;
      if (pending) window.clearTimeout(pending);
      pending = window.setTimeout(function () {
        var next = readState();
        next.q = value.trim();
        /* replaceState while typing: one history entry per search, not one per
           keystroke, so Back leaves the page instead of retyping it. */
        writeState(next, true);
        load(next);
      }, DEBOUNCE_MS);
    });
  }

  window.addEventListener('popstate', function () { load(readState()); });

  fetch(API + '/api/public/case-study-taxonomy?surface=' + SURFACE, {
    headers: { Accept: 'application/json' },
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (body) { facets = (body && body.facets) || null; })
    .catch(function () { facets = null; })
    .then(function () { return load(state); });
})();
