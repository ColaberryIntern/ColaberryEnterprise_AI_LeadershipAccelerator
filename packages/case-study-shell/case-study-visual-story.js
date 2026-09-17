/**
 * The visual story band, framework-free: the workflow illustration, the
 * outcome cards with their count-up, and the charts, mounted under a record's
 * facts on whichever brand's site the reader is on.
 *
 * WHY THIS EXISTS. Ali, 2026-09-16, on the Enterprise pilot: "They need to be
 * done for all the published sites." aiflotation.com is static HTML drawn by
 * the shell and training.colaberry.com is a Next.js page that vendors the
 * shell's stylesheet; neither can import the Enterprise React band. One
 * framework-free band in the shell, mounted by both, is how the same record
 * shows the same drawing and the same figures everywhere it is published.
 *
 * A PORT of `StoryVisualStory.tsx`, `StoryOutcomeCards.tsx`, `StoryCharts.tsx`,
 * `StoryChartPrimitives.tsx` and `useCountUp.ts`, class for class, so the
 * Enterprise sheet ported to `--cs-*` tokens styles it. The model and the
 * geometry are `case-study-visual-model.js`; the drawing is
 * `case-study-visual-graph.js`. Load those two first.
 *
 * EVERY FIGURE IS THE WIRE'S. The cards are projected metrics, every chart
 * part was resolved server-side from a verified metric, and the band computes
 * nothing; its foot says so in words.
 *
 * THE COUNT-UP KEEPS THREE RULES. The final text is the record's wording,
 * exactly, and it is what a capture, a print or a crawler reads before anyone
 * scrolls (the digits rest at the final value until the card is in view).
 * Assistive tech never hears an intermediate value: the true wording is in a
 * visually hidden span from the first paint and the moving digits are
 * `aria-hidden` until they settle. Reduced motion gets the final value at once.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./case-study-visual-model'), require('./case-study-visual-graph'));
  } else root.CaseStudyVisualStory = factory(root.CaseStudyVisualModel, root.CaseStudyVisualGraph);
})(typeof self !== 'undefined' ? self : this, function (model, graphModule) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function svg(tag, attrs, className) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    if (className) node.setAttribute('class', className);
    return node;
  }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function pctAttr(p) { return String(Math.round(p * 100) / 100); }
  function verificationWord(metric, className) {
    return metric.verificationClass ? el('span', 'cs-verify ' + className, metric.verificationClass) : null;
  }

  /* ------------------------------------------------------------- count-up --- */

  /**
   * Splits "2,500+ certified" into 2500, "" and "+ certified"; null when nothing
   * leads with a number. The number ends on its last digit, so the space in
   * "34 minutes" belongs to the suffix and every frame reads "21 minutes".
   */
  function parseFigure(text) {
    var m = String(text).match(/^(\D*?)(\d(?:[\d,\s]*\d)?)([\s\S]*)$/);
    if (!m) return null;
    var value = Number(m[2].replace(/[,\s]/g, ''));
    if (!isFinite(value) || value <= 0) return null;
    return { value: value, prefix: m[1], suffix: m[3] };
  }
  function group(n, original) { return original.indexOf(',') >= 0 ? fmt(n) : String(n); }

  /**
   * Counts `digits` up from zero to `text` once `watch` is in view, over
   * `durationMs`; the digits show `text` until then. Returns `cancel()`.
   */
  function countUp(watch, digits, text, durationMs) {
    var parsed = parseFigure(text);
    function finish() { digits.textContent = text; digits.setAttribute('aria-hidden', 'false'); digits.setAttribute('data-settled', 'true'); }
    if (!parsed) { finish(); return function () {}; }
    var reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver !== 'function') { finish(); return function () {}; }
    var frame = 0;
    var started = false;
    var timer = 0;
    function run() {
      var startedAt = performance.now();
      digits.setAttribute('aria-hidden', 'true');
      digits.setAttribute('data-settled', 'false');
      function tick(now) {
        var t = Math.min(1, (now - startedAt) / durationMs);
        var eased = 1 - Math.pow(1 - t, 3);
        if (t >= 1) { finish(); return; }
        digits.textContent = parsed.prefix + group(Math.round(parsed.value * eased), text) + parsed.suffix;
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !started) { started = true; io.disconnect(); run(); }
      });
    }, { threshold: 0.4 });
    io.observe(watch);
    /* The backstop rescues a figure that is on screen and still not counting;
       off screen it re-arms, so the count is never spent before it can be seen. */
    function arm() {
      timer = window.setTimeout(function () {
        if (started) return;
        var r = watch.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { started = true; io.disconnect(); finish(); return; }
        arm();
      }, 2500);
    }
    arm();
    return function () { io.disconnect(); window.clearTimeout(timer); if (frame) cancelAnimationFrame(frame); };
  }

  /* ---------------------------------------------------------------- cards --- */

  function outcomeCard(card, lead, cancels) {
    var m = card.metric;
    var article = el('article', 'cbv2-rv cbv2-story-visual__card' + (lead ? ' cbv2-story-visual__card--lead' : ''));
    article.setAttribute('data-testid', 'story-outcome-card');
    article.setAttribute('data-animate', card.animate ? 'true' : 'false');
    var figure = el('p', 'cbv2-story-visual__card-figure');
    if (card.animate) {
      figure.appendChild(el('span', 'cbv2-sr-only', card.figure));
      var digits = el('span', null, card.figure);
      digits.setAttribute('aria-hidden', 'false');
      digits.setAttribute('data-settled', 'true');
      digits.setAttribute('data-testid', 'story-card-digits');
      figure.appendChild(digits);
      cancels.push(countUp(figure, digits, card.figure, 1100));
    } else figure.textContent = card.figure;
    article.appendChild(figure);
    article.appendChild(el('h3', 'cbv2-story-visual__card-label', m.label));
    if (card.statement !== card.figure) article.appendChild(el('p', 'cbv2-story-visual__card-statement', card.statement));
    if (m.baseline) {
      var base = el('p', 'cbv2-story-visual__card-baseline');
      base.appendChild(el('span', 'cbv2-story-visual__card-term', 'Baseline'));
      base.appendChild(document.createTextNode(m.baseline));
      article.appendChild(base);
    }
    var word = verificationWord(m, 'cbv2-story-visual__card-badge');
    if (word) article.appendChild(word);
    return article;
  }

  function cardsView(cards, cancels) {
    if (!cards.length) return null;
    var wrap = el('div', 'cbv2-story-visual__cards');
    wrap.setAttribute('data-testid', 'story-outcome-cards');
    wrap.setAttribute('data-count', String(cards.length));
    cards.forEach(function (card, i) { wrap.appendChild(outcomeCard(card, i === 0, cancels)); });
    return wrap;
  }

  /* --------------------------------------------------------------- charts --- */

  function bar(percent, status) {
    var s = svg('svg', { viewBox: '0 0 100 8', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, 'cbv2-story-visual__bar');
    s.appendChild(svg('rect', { x: 0, y: 0, width: 100, height: 8, rx: 2 }, 'cbv2-story-visual__bar-track'));
    s.appendChild(svg('rect', { x: 0, y: 0, width: pctAttr(percent), height: 8, rx: 2 }, 'cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--' + status));
    return s;
  }

  function stackedBar(rows, remainderPercent) {
    var s = svg('svg', { viewBox: '0 0 100 12', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, 'cbv2-story-visual__bar cbv2-story-visual__bar--stacked');
    s.appendChild(svg('rect', { x: 0, y: 0, width: 100, height: 12, rx: 2 }, 'cbv2-story-visual__bar-track'));
    var x = 0;
    rows.forEach(function (row) {
      s.appendChild(svg('rect', { x: pctAttr(x), y: 0, width: pctAttr(row.percent), height: 12 }, 'cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--' + row.status));
      x += row.percent;
    });
    if (remainderPercent > 0) s.appendChild(svg('rect', { x: pctAttr(x), y: 0, width: pctAttr(remainderPercent), height: 12 }, 'cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--unknown'));
    return s;
  }

  function barRow(row) {
    var li = el('li', 'cbv2-story-visual__row cbv2-story-visual__row--' + row.status);
    li.appendChild(el('span', 'cbv2-story-visual__row-label', row.label));
    li.appendChild(el('span', 'cbv2-story-visual__row-figure', row.figure));
    li.appendChild(bar(row.percent, row.status));
    li.appendChild(el('span', 'cbv2-story-visual__row-status', row.statusWord));
    if (row.caveat) li.appendChild(el('span', 'cbv2-story-visual__row-caveat', row.caveat));
    return li;
  }

  function cell(tag, text, className) { var c = el(tag, className, text); return c; }

  function chartTable(chart) {
    var remainder = chart.kind === 'composition' ? model.compositionRemainder(chart) : 0;
    var details = el('details', 'cbv2-story-visual__table-fold');
    details.appendChild(el('summary', 'cbv2-story-visual__table-summary', 'Show the numbers'));
    var table = el('table', 'cbv2-story-visual__table');
    table.setAttribute('data-testid', 'story-chart-table');
    table.appendChild(el('caption', 'cbv2-sr-only', chart.summary));
    var thead = el('thead');
    var hr = el('tr');
    ['Part', 'Value', chart.kind === 'two_value' ? (chart.unit || 'Value') : 'Of', 'Status'].forEach(function (h) {
      var th = cell('th', h); th.setAttribute('scope', 'col'); hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el('tbody');
    chart.rows.forEach(function (row) {
      var tr = el('tr');
      var th = cell('th', row.label); th.setAttribute('scope', 'row');
      if (row.caveat) th.appendChild(el('span', 'cbv2-story-visual__table-caveat', ' (' + row.caveat + ')'));
      tr.appendChild(th);
      tr.appendChild(cell('td', fmt(row.value)));
      tr.appendChild(cell('td', chart.kind === 'two_value' ? (chart.unit || '') : fmt(row.denominator)));
      tr.appendChild(cell('td', row.statusWord));
      tbody.appendChild(tr);
    });
    if (chart.kind === 'composition') {
      if (remainder > 0) {
        var rr = el('tr');
        var rth = cell('th', 'Not accounted for above'); rth.setAttribute('scope', 'row');
        rr.appendChild(rth); rr.appendChild(cell('td', fmt(remainder))); rr.appendChild(cell('td', fmt(chart.denominator))); rr.appendChild(cell('td', 'Unknown'));
        tbody.appendChild(rr);
      }
      var total = el('tr', 'cbv2-story-visual__table-total');
      var tth = cell('th', 'Total'); tth.setAttribute('scope', 'row');
      total.appendChild(tth); total.appendChild(cell('td', fmt(chart.denominator))); total.appendChild(cell('td', fmt(chart.denominator))); total.appendChild(cell('td', ''));
      tbody.appendChild(total);
    }
    table.appendChild(tbody);
    details.appendChild(table);
    return details;
  }

  function chartFrame(chart, body) {
    var fig = el('figure', 'cbv2-story-visual__chart cbv2-story-visual__chart--' + chart.kind);
    fig.setAttribute('data-testid', 'story-chart');
    fig.setAttribute('data-chart-kind', chart.kind);
    fig.setAttribute('aria-label', chart.summary);
    var head = el('figcaption', 'cbv2-story-visual__chart-head');
    head.appendChild(el('span', 'cbv2-story-visual__chart-title', chart.title));
    if (chart.caption) head.appendChild(el('span', 'cbv2-story-visual__chart-caption', chart.caption));
    var word = verificationWord(chart.metric, 'cbv2-story-visual__chart-badge');
    if (word) head.appendChild(word);
    fig.appendChild(head);
    body.forEach(function (b) { if (b) fig.appendChild(b); });
    if (chart.note) fig.appendChild(el('p', 'cbv2-story-visual__chart-note', chart.note));
    if (chart.caveat) fig.appendChild(el('p', 'cbv2-story-visual__chart-caveat', chart.caveat));
    if (chart.limitations.length) {
      var ul = el('ul', 'cbv2-story-visual__chart-limits');
      chart.limitations.forEach(function (l) { ul.appendChild(el('li', null, l)); });
      fig.appendChild(ul);
    }
    fig.appendChild(chartTable(chart));
    return fig;
  }

  function legendItem(status, label, figure) {
    var li = el('li', 'cbv2-story-visual__legend-item cbv2-story-visual__legend-item--' + status);
    var sw = el('span', 'cbv2-story-visual__legend-swatch'); sw.setAttribute('aria-hidden', 'true');
    li.appendChild(sw);
    li.appendChild(el('span', 'cbv2-story-visual__legend-label', label));
    li.appendChild(el('span', 'cbv2-story-visual__legend-figure', figure));
    return li;
  }

  function composition(chart) {
    var remainder = model.compositionRemainder(chart);
    var remainderPercent = chart.denominator > 0 ? (remainder / chart.denominator) * 100 : 0;
    var legend = el('ul', 'cbv2-story-visual__legend');
    chart.rows.forEach(function (row) { legend.appendChild(legendItem(row.status, row.label, row.figure)); });
    if (remainder > 0) legend.appendChild(legendItem('unknown', 'Not accounted for above', fmt(remainder) + ' of ' + fmt(chart.denominator)));
    return chartFrame(chart, [stackedBar(chart.rows, remainderPercent), legend, el('p', 'cbv2-story-visual__chart-total', 'Of ' + fmt(chart.denominator) + ' in total.')]);
  }

  function bars(chart) {
    var ul = el('ul', 'cbv2-story-visual__rows');
    chart.rows.forEach(function (row) { ul.appendChild(barRow(row)); });
    var total = null;
    if (chart.kind === 'share') total = el('p', 'cbv2-story-visual__chart-total', 'Share of ' + fmt(chart.denominator) + '.');
    if (chart.kind === 'two_value' && chart.axisMax !== null && chart.axisMax !== undefined) {
      total = el('p', 'cbv2-story-visual__chart-total', 'Bars scaled to ' + fmt(chart.axisMax) + (chart.unit ? ' ' + chart.unit : '') + '.');
    }
    return chartFrame(chart, [ul, total]);
  }

  function zeroCard(chart) {
    var row = chart.rows[0];
    var p = el('p', 'cbv2-story-visual__zero');
    p.appendChild(el('strong', 'cbv2-story-visual__zero-figure', fmt(row.value)));
    p.appendChild(el('span', 'cbv2-story-visual__zero-of', 'of ' + fmt(row.denominator)));
    p.appendChild(el('span', 'cbv2-story-visual__zero-label', row.label));
    return chartFrame(chart, [p]);
  }

  function chartsView(charts) {
    if (!charts.length) return null;
    var wrap = el('div', 'cbv2-story-visual__charts');
    wrap.setAttribute('data-testid', 'story-charts');
    charts.forEach(function (chart) {
      wrap.appendChild(chart.kind === 'composition' ? composition(chart) : chart.kind === 'zero_card' ? zeroCard(chart) : bars(chart));
    });
    return wrap;
  }

  /* ----------------------------------------------------------------- band --- */

  var FOOT_FIGURES = "Every figure above is a verified metric on this record, shown with its own verification badge. The drawing is the team's illustration of the flow, not a live view of it.";
  var FOOT_NONE = "The drawing is the team's illustration of the flow, drawn from the repository's own evidence, not a live view of it. This record carries no measured outcome yet, so it shows no figures.";

  /** True when the band would show a card or a chart, so the host can fold its own metric cards. */
  function showsFigures(story) {
    return Boolean(story) && (model.outcomeCardsFor(story).length > 0 || model.chartsFor(story).length > 0);
  }

  /**
   * Builds the band for `story` inside `container` (emptied first) and
   * returns `{ element, destroy }`. `opts.onInteraction(visual, action)` is
   * told about every press, for the host's tracker. Null when the story has
   * nothing to show; the container is then left alone.
   */
  function mount(container, story, opts) {
    opts = opts || {};
    story = model.visualStoryFor({ visualStory: story });
    if (!story) return null;
    var cards = model.outcomeCardsFor(story);
    var charts = model.chartsFor(story);
    var hasFigures = cards.length > 0 || charts.length > 0;
    var cancels = [];
    var section = el('section', 'cbv2-rv cbv2-section cbv2-story-visual cs-band cs-visual-story');
    section.setAttribute('aria-labelledby', 'cbv2-story-visual-title');
    section.setAttribute('data-testid', 'story-visual');
    section.setAttribute('data-story-zone', 'visual');
    section.setAttribute('data-band', 'visual-story');
    var body = el('div', 'cbv2-wrap cbv2-story-visual__body');
    var head = el('header', 'cbv2-story-visual__head');
    head.appendChild(el('p', 'cbv2-eyebrow cs-eyebrow', hasFigures ? 'How it works, and what it measured' : 'How it works'));
    var h2 = el('h2', 'cbv2-story-visual__heading cs-band-title', 'The system, drawn from its own record');
    h2.id = 'cbv2-story-visual-title';
    head.appendChild(h2);
    body.appendChild(head);
    var g = null;
    if (story.workflow) {
      g = graphModule.graph(story.workflow, { motion: story.motion, onInteraction: opts.onInteraction });
      body.appendChild(g.element);
    }
    var cardsEl = cardsView(cards, cancels);
    if (cardsEl) body.appendChild(cardsEl);
    var chartsEl = chartsView(charts);
    if (chartsEl) body.appendChild(chartsEl);
    body.appendChild(el('p', 'cbv2-story-visual__note', hasFigures ? FOOT_FIGURES : FOOT_NONE));
    section.appendChild(body);
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(section);
    if (g) g.start();
    return {
      element: section,
      destroy: function () {
        if (g) g.destroy();
        cancels.forEach(function (c) { c(); });
        if (section.parentNode) section.parentNode.removeChild(section);
      },
    };
  }

  return { mount: mount, showsFigures: showsFigures, countUp: countUp, parseFigure: parseFigure };
});
