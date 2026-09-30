/**
 * The workflow illustration, framework-free: the SVG, the step panel beside it
 * and the particles that travel its edges.
 *
 * A PORT of `StoryWorkflowGraph.tsx`, `StoryWorkflowPanel.tsx` and
 * `useWorkflowMotion.ts` from the Enterprise page, in plain script, so the
 * same drawing appears on aiflotation.com and training.colaberry.com. Same
 * class names, same markup, same keyboard: every node is a `<g role="button"
 * tabindex="0" aria-pressed>`, Enter and Space select it, Before and After
 * are real buttons, and the lane is a labelled band. Nothing is legible only
 * by colour: role and status are words in the box and in the accessible name.
 *
 * NOTHING HERE IS A FIGURE. The graph draws the record's own nodes and edges.
 * The one figure a step can carry, its tally, is a projected metric shown in
 * the panel with the verification word every other figure on the page has.
 *
 * MOTION IS ILLUSTRATIVE, AND SAID SO. Fixed cadence, fixed travel time; the
 * particles show which way the flow runs and nothing else. They stay still
 * under `prefers-reduced-motion`, when the reader pressed Pause, when the
 * drawing is off screen or the tab hidden, when the record set motion off,
 * and when the browser cannot measure a path.
 *
 * REDRAWN, NOT DIFFED. A panel switch or a new width rebuilds the SVG from
 * the layout; the drawing is small and the rebuild is cheaper than the
 * bookkeeping of a partial update. A selection only moves the pressed ring
 * and rebuilds the step panel, so the particles keep flowing.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./case-study-visual-model'));
  else root.CaseStudyVisualGraph = factory(root.CaseStudyVisualModel);
})(typeof self !== 'undefined' ? self : this, function (model) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SPAWN_MS = 1500;
  var TRAVEL_MS = 1900;
  var uid = 0;

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
  function button(className, text, action, onClick) {
    var b = el('button', className, text);
    b.type = 'button';
    b.setAttribute('data-story-zone', 'visual');
    b.setAttribute('data-visual', 'workflow');
    b.setAttribute('data-visual-action', action);
    b.addEventListener('click', onClick);
    return b;
  }
  function reducedNow() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* --------------------------------------------------------------- motion --- */

  /** Particles on one SVG's motion paths; `start()` after the SVG is in the document, `stop()` before it leaves. */
  function motion(svgEl, layer) {
    var paths = [];
    var particles = [];
    var lastSpawn = [];
    var frame = 0;
    var start = 0;
    function tick(now) {
      var elapsed = now - start;
      paths.forEach(function (path, i) {
        var last = lastSpawn[i] === undefined ? -Infinity : lastSpawn[i];
        if (elapsed >= path.offset && now - last >= SPAWN_MS) {
          var c = svg('circle', { r: 4 }, 'cbv2-story-visual__particle cbv2-story-visual__particle--' + path.status);
          layer.appendChild(c);
          particles.push({ el: c, path: path, born: now });
          lastSpawn[i] = now;
        }
      });
      for (var j = particles.length - 1; j >= 0; j -= 1) {
        var p = particles[j];
        var t = (now - p.born) / TRAVEL_MS;
        if (t >= 1) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); particles.splice(j, 1); }
        else {
          var point = p.path.el.getPointAtLength(p.path.length * t);
          p.el.setAttribute('cx', String(point.x));
          p.el.setAttribute('cy', String(point.y));
        }
      }
      frame = window.requestAnimationFrame(tick);
    }
    return {
      start: function () {
        if (frame) return;
        var raw = Array.prototype.slice.call(svgEl.querySelectorAll('path[data-motion="true"]'));
        if (!raw.length || typeof raw[0].getTotalLength !== 'function' || typeof raw[0].getPointAtLength !== 'function') return;
        paths = raw.map(function (p, i) {
          return { el: p, length: p.getTotalLength(), offset: (i * 230) % SPAWN_MS, status: p.getAttribute('data-status') || 'processing' };
        });
        lastSpawn = [];
        start = performance.now();
        frame = window.requestAnimationFrame(tick);
      },
      stop: function () {
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        particles.forEach(function (p) { if (p.el.parentNode) p.el.parentNode.removeChild(p.el); });
        particles = [];
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      },
    };
  }

  /* ---------------------------------------------------------------- panel --- */

  function verificationWord(metric) {
    return metric.verificationClass ? el('span', 'cs-verify cbv2-story-visual__panel-badge', metric.verificationClass) : null;
  }

  function panelView(node, incoming, position, count, panelLabel, onPrevious, onNext) {
    var aside = el('aside', 'cbv2-story-visual__panel');
    aside.setAttribute('data-testid', 'story-workflow-panel');
    aside.setAttribute('aria-label', panelLabel + ': selected step');
    var body = el('div', 'cbv2-story-visual__panel-body');
    body.setAttribute('aria-live', 'polite');
    var kicker = el('p', 'cbv2-story-visual__panel-kicker', node.kicker || ('Step ' + position + ' of ' + count));
    kicker.appendChild(el('span', 'cbv2-story-visual__status cbv2-story-visual__status--' + node.status, model.STATUS_WORD[node.status]));
    body.appendChild(kicker);
    body.appendChild(el('h4', 'cbv2-story-visual__panel-title', node.label));
    if (node.sublabel) body.appendChild(el('p', 'cbv2-story-visual__panel-sub', node.sublabel));
    if (node.detail) body.appendChild(el('p', 'cbv2-story-visual__panel-detail', node.detail));
    if (incoming.length) {
      var inc = el('p', 'cbv2-story-visual__panel-incoming');
      inc.appendChild(el('span', 'cbv2-story-visual__panel-term', 'Reached from'));
      inc.appendChild(document.createTextNode(incoming.map(function (c) {
        return c.from + (c.label ? ' (' + c.label + ')' : '') + (c.condition ? ', ' + c.condition : '');
      }).join('; ')));
      body.appendChild(inc);
    }
    if (node.evidence) {
      var ev = el('p', 'cbv2-story-visual__panel-evidence');
      ev.appendChild(el('span', 'cbv2-story-visual__panel-term', 'Where the proof lives'));
      ev.appendChild(document.createTextNode(node.evidence));
      body.appendChild(ev);
    }
    if (node.tally) {
      var tally = el('p', 'cbv2-story-visual__panel-tally');
      tally.setAttribute('data-testid', 'story-workflow-tally');
      tally.appendChild(el('strong', 'cbv2-story-visual__panel-figure', node.tally.valueDisplay));
      tally.appendChild(el('span', 'cbv2-story-visual__panel-tally-label', node.tally.label));
      var word = verificationWord(node.tally);
      if (word) tally.appendChild(word);
      body.appendChild(tally);
    }
    aside.appendChild(body);
    var nav = el('div', 'cbv2-story-visual__panel-nav');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Walk the steps');
    var prev = button('cbv2-story-visual__nav-btn', 'Previous', 'previous', onPrevious);
    var next = button('cbv2-story-visual__nav-btn', 'Next', 'next', onNext);
    if (count < 2) { prev.disabled = true; next.disabled = true; }
    nav.appendChild(prev);
    nav.appendChild(el('span', 'cbv2-story-visual__panel-position', position + ' / ' + count));
    nav.appendChild(next);
    aside.appendChild(nav);
    return aside;
  }

  /* -------------------------------------------------------------- drawing --- */

  function drawing(panel, layout, selectedKey, arrowId, select) {
    var s = svg('svg', { viewBox: layout.viewBox, role: 'group' }, 'cbv2-story-visual__svg');
    s.setAttribute('aria-label', panel.label + ': ' + panel.nodes.length + ' steps, ' + panel.edges.length + ' connections');
    s.setAttribute('data-testid', 'story-workflow-svg');
    var defs = svg('defs');
    var marker = svg('marker', { id: arrowId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z' }, 'cbv2-story-visual__arrowhead'));
    defs.appendChild(marker);
    s.appendChild(defs);
    layout.lanes.forEach(function (lane) {
      var g = svg('g', {}, 'cbv2-story-visual__lane cbv2-story-visual__lane--' + lane.lane);
      g.appendChild(svg('rect', { x: lane.x, y: lane.y, width: lane.width, height: lane.height }, 'cbv2-story-visual__lane-band'));
      if (layout.orientation === 'horizontal') {
        var t = svg('text', { x: lane.x + 16, y: lane.y + 17 }, 'cbv2-story-visual__lane-label');
        t.textContent = lane.label;
        g.appendChild(t);
      }
      s.appendChild(g);
    });
    layout.edges.forEach(function (edge, i) {
      var g = svg('g', {}, 'cbv2-story-visual__edge cbv2-story-visual__edge--' + edge.status + (edge.returns ? ' cbv2-story-visual__edge--returns' : ''));
      var p = svg('path', { d: edge.d, 'marker-end': 'url(#' + arrowId + ')', 'data-edge-index': i, 'data-motion': edge.motion ? 'true' : 'false', 'data-status': edge.status }, 'cbv2-story-visual__edge-path');
      g.appendChild(p);
      if (edge.label && edge.labelFits) {
        var t = svg('text', { x: edge.labelX, y: edge.labelY - model.LABEL_LIFT, 'text-anchor': 'middle' }, 'cbv2-story-visual__edge-label');
        t.textContent = edge.label;
        g.appendChild(t);
      }
      s.appendChild(g);
    });
    var layer = svg('g', { 'aria-hidden': 'true' }, 'cbv2-story-visual__particles');
    s.appendChild(layer);
    layout.nodes.forEach(function (box) {
      var n = panel.nodes.filter(function (x) { return x.key === box.key; })[0];
      var current = n.key === selectedKey;
      var g = svg('g', { transform: 'translate(' + box.x + ' ' + box.y + ')', role: 'button', tabindex: 0, 'aria-pressed': current ? 'true' : 'false', 'data-node-key': n.key, 'data-story-zone': 'visual', 'data-visual': 'workflow', 'data-visual-action': 'node:' + n.key },
        'cbv2-story-visual__node cbv2-story-visual__node--' + n.role + ' cbv2-story-visual__node--' + n.status);
      g.setAttribute('aria-label', n.label + ', ' + model.ROLE_WORD[n.role] + ', ' + model.STATUS_WORD[n.status]);
      g.appendChild(svg('rect', { width: box.width, height: box.height, rx: 8 }, 'cbv2-story-visual__node-box'));
      var role = svg('text', { x: 12, y: 17 }, 'cbv2-story-visual__node-role');
      role.textContent = model.ROLE_WORD[n.role];
      g.appendChild(role);
      g.appendChild(svg('circle', { cx: box.width - 12, cy: 12, r: 4 }, 'cbv2-story-visual__node-dot'));
      var label = svg('text', { x: 12, y: box.labelLines.length > 1 ? 36 : 42 }, 'cbv2-story-visual__node-label');
      box.labelLines.forEach(function (line, li) {
        var span = svg('tspan', { x: 12, dy: li === 0 ? 0 : 15 });
        span.textContent = line;
        label.appendChild(span);
      });
      g.appendChild(label);
      g.addEventListener('click', function () { select(n.key); });
      g.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(n.key); }
      });
      s.appendChild(g);
    });
    return { svg: s, layer: layer };
  }

  function stepList(panel) {
    var ol = el('ol', 'cbv2-sr-only');
    ol.setAttribute('data-testid', 'story-workflow-steps');
    model.panelSelectionOrder(panel).forEach(function (key) {
      var node = panel.nodes.filter(function (n) { return n.key === key; })[0];
      ol.appendChild(el('li', null, node.label + ': ' + model.STATUS_WORD[node.status] + (node.detail ? '. ' + node.detail : '')));
    });
    return ol;
  }

  /* ---------------------------------------------------------------- graph --- */

  /**
   * The whole illustration. `opts.motion` is the record's setting ('auto' or
   * 'off'); `opts.onInteraction(visual, action)` is told about every press.
   * Returns the element and `destroy()`, which stops the frame loop and the
   * observers; call it before the element leaves the document.
   */
  function graph(workflow, opts) {
    opts = opts || {};
    var id = 'cbv2-arrow-' + (++uid);
    var panels = workflow.panels;
    var panelKey = (panels.filter(function (p) { return p.key === 'after'; })[0] || panels[0]).key;
    var selected = {};
    var paused = false;
    var reduced = reducedNow();
    var visible = false;
    var hidden = typeof document !== 'undefined' && document.hidden;
    var enabled = opts.motion !== 'off';
    var running = null;
    var current = { svg: null, layer: null };
    var wrap = el('div', 'cbv2-story-visual__workflow');
    wrap.setAttribute('data-testid', 'story-workflow');
    var head = el('div', 'cbv2-story-visual__workflow-head');
    head.appendChild(el('h3', 'cbv2-story-visual__title', workflow.title));
    if (workflow.caption) head.appendChild(el('p', 'cbv2-story-visual__caption', workflow.caption));
    head.appendChild(el('p', 'cbv2-story-visual__description', workflow.description));
    wrap.appendChild(head);
    var toggle = null;
    if (workflow.type === 'before_after') {
      toggle = el('div', 'cbv2-story-visual__toggle');
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', 'Workflow state');
      wrap.appendChild(toggle);
    }
    var summary = el('p', 'cbv2-story-visual__panel-summary');
    wrap.appendChild(summary);
    var stage = el('div', 'cbv2-story-visual__stage');
    var canvas = el('div', 'cbv2-story-visual__canvas');
    stage.appendChild(canvas);
    wrap.appendChild(stage);
    var note = el('p', 'cbv2-story-visual__motion-note');
    note.appendChild(el('span', null, workflow.motionNote));
    var motionBtn = null;
    if (enabled) {
      motionBtn = button('cbv2-story-visual__motion-btn', '', 'pause', function () { paused = !paused; tell('workflow', paused ? 'pause' : 'play'); syncMotion(); });
      motionBtn.setAttribute('data-testid', 'story-workflow-motion');
      note.appendChild(motionBtn);
    }
    wrap.appendChild(note);

    function tell(visual, action) { if (typeof opts.onInteraction === 'function') opts.onInteraction(visual, action); }
    function panel() { return panels.filter(function (p) { return p.key === panelKey; })[0] || panels[0]; }
    function canvasWidth() {
      var w = canvas.clientWidth;
      return Math.max(200, w > 0 ? w : window.innerWidth - 48);
    }
    function state() { return !enabled ? 'off' : reduced ? 'reduced' : paused ? 'paused' : 'running'; }
    function syncMotion() {
      var st = state();
      if (motionBtn) {
        motionBtn.textContent = st === 'running' ? 'Pause motion' : st === 'paused' ? 'Play motion' : 'Reduced motion';
        motionBtn.setAttribute('aria-pressed', st === 'paused' ? 'true' : 'false');
        motionBtn.disabled = st === 'reduced';
        motionBtn.setAttribute('data-visual-action', st === 'running' ? 'pause' : 'play');
      }
      var run = st === 'running' && visible && !hidden;
      if (run && current.svg && !running) { running = motion(current.svg, current.layer); running.start(); }
      else if (!run && running) { running.stop(); running = null; }
    }
    /** The step panel for the selected node, and the pressed ring on the drawing; the SVG itself is left alone. */
    function renderSelection() {
      var p = panel();
      var order = model.panelSelectionOrder(p);
      var selectedKey = selected[p.key] || p.initialNodeKey;
      var position = Math.max(0, order.indexOf(selectedKey));
      var node = p.nodes.filter(function (n) { return n.key === selectedKey; })[0] || p.nodes[0];
      if (current.svg) {
        Array.prototype.forEach.call(current.svg.querySelectorAll('[data-node-key]'), function (g) {
          g.setAttribute('aria-pressed', g.getAttribute('data-node-key') === selectedKey ? 'true' : 'false');
        });
      }
      var old = stage.querySelector('.cbv2-story-visual__panel');
      if (old) stage.removeChild(old);
      var incoming = p.edges.filter(function (e) { return e.to === selectedKey; }).map(function (e) {
        var from = p.nodes.filter(function (n) { return n.key === e.from; })[0];
        return { from: from ? from.label : e.from, label: e.label, condition: e.condition };
      });
      stage.appendChild(panelView(node, incoming, position + 1, order.length, p.label,
        function () { tell('workflow', 'previous'); select(order[(position - 1 + order.length) % order.length]); },
        function () { tell('workflow', 'next'); select(order[(position + 1) % order.length]); }));
    }
    function select(key) { selected[panel().key] = key; tell('workflow', 'node:' + key); renderSelection(); }
    /** The whole drawing, for a panel switch or a new width. */
    function render() {
      var p = panel();
      var selectedKey = selected[p.key] || p.initialNodeKey;
      var layout = model.layoutWorkflowToFit(p, window.innerWidth, canvasWidth());
      wrap.setAttribute('data-orientation', layout.orientation);
      if (toggle) {
        while (toggle.firstChild) toggle.removeChild(toggle.firstChild);
        panels.forEach(function (pp) {
          var b = button('cbv2-story-visual__toggle-btn', pp.label, 'panel:' + pp.key, function () { panelKey = pp.key; tell('workflow', 'panel:' + pp.key); render(); });
          b.setAttribute('aria-pressed', pp.key === p.key ? 'true' : 'false');
          toggle.appendChild(b);
        });
      }
      summary.textContent = p.summary || '';
      summary.hidden = !p.summary;
      if (running) { running.stop(); running = null; }
      while (canvas.firstChild) canvas.removeChild(canvas.firstChild);
      current = drawing(p, layout, selectedKey, id, select);
      canvas.appendChild(current.svg);
      canvas.appendChild(stepList(p));
      renderSelection();
      syncMotion();
    }

    var query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function onMotionPref() { reduced = query.matches; syncMotion(); }
    if (query && typeof query.addEventListener === 'function') query.addEventListener('change', onMotionPref);
    function onVisibility() { hidden = document.hidden; syncMotion(); }
    document.addEventListener('visibilitychange', onVisibility);
    var io = null;
    if (typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver(function (entries) {
        visible = entries.some(function (e) { return e.isIntersecting; });
        syncMotion();
      }, { threshold: 0.1 });
      io.observe(canvas);
    } else visible = true;
    var lastWidth = 0;
    function onResize() {
      var w = canvasWidth();
      if (w !== lastWidth) { lastWidth = w; render(); }
    }
    window.addEventListener('resize', onResize);
    var ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(onResize); ro.observe(canvas); }

    return {
      element: wrap,
      /** Draw once the element is in the document, so the canvas has a width to measure. */
      start: function () { lastWidth = canvasWidth(); render(); },
      destroy: function () {
        if (running) { running.stop(); running = null; }
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        if (query && typeof query.removeEventListener === 'function') query.removeEventListener('change', onMotionPref);
      },
    };
  }

  return { graph: graph, motion: motion };
});
