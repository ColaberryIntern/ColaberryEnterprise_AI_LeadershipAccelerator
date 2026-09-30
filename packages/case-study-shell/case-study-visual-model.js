/**
 * The visual story's model and geometry, framework-free.
 *
 * A PORT, NOT A SECOND OPINION. Everything here is `storyVisualModel.ts`,
 * `storyWorkflowLayout.ts` and `storyWorkflowEdges.ts` from the Enterprise
 * page, written in plain script so the shell can draw the same band on
 * aiflotation.com and training.colaberry.com without a bundler. The frontend's
 * `storyVisualShellParity.test.ts` runs both against the same records and
 * fails when they disagree, so the two cannot drift apart quietly.
 *
 * NOTHING HERE COMPUTES A FIGURE. Every number a reader sees arrived on the
 * wire already resolved from a verified metric; this module arranges those
 * numbers into rows a bar can be drawn from and sentences a screen reader can
 * say. Geometry is a total function of the panel and a width: the same record
 * draws the same drawing on every site.
 *
 * UMD. `module.exports` under CommonJS (the Next.js training site and the
 * tests), `window.CaseStudyVisualModel` in a browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CaseStudyVisualModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUS_WORD = {
    processing: 'In flow', resolved: 'Resolved', attention: 'Needs attention', failure: 'Failed', unknown: 'Unknown',
  };
  var ROLE_WORD = { human: 'Person', system: 'System', external: 'External', data: 'Data' };

  function fmt(n) { return Number(n).toLocaleString('en-US'); }

  /* ---------------------------------------------------------------- story --- */

  function visualStoryFor(record) {
    var story = record && record.visualStory;
    if (!story) return null;
    if (!story.workflow && !(story.outcomeCards || []).length && !(story.charts || []).length) return null;
    return story;
  }

  /** The order Previous / Next walk the nodes: the initial node, then breadth-first, then the unreachable. */
  function panelSelectionOrder(panel) {
    var keys = panel.nodes.map(function (n) { return n.key; });
    var known = {};
    keys.forEach(function (k) { known[k] = true; });
    var start = known[panel.initialNodeKey] ? panel.initialNodeKey : keys[0];
    var order = [];
    var seen = {};
    var queue = start ? [start] : [];
    while (queue.length) {
      var k = queue.shift();
      if (seen[k]) continue;
      seen[k] = true;
      order.push(k);
      panel.edges.forEach(function (e) { if (e.from === k && known[e.to] && !seen[e.to]) queue.push(e.to); });
    }
    keys.forEach(function (k) { if (!seen[k]) { seen[k] = true; order.push(k); } });
    return order;
  }

  /** At most `lines` lines of about `width` characters, breaking at spaces; the last line ends in an ellipsis when over budget. */
  function wrapLabel(text, width, lines) {
    width = width === undefined ? 22 : width;
    lines = lines === undefined ? 2 : lines;
    var words = String(text).trim().split(/\s+/).filter(Boolean);
    var out = [];
    var line = '';
    words.forEach(function (word) {
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    });
    if (line) out.push(line);
    if (out.length <= lines) return out;
    var kept = out.slice(0, lines);
    kept[lines - 1] = kept[lines - 1].slice(0, Math.max(1, width - 1)) + '…';
    return kept;
  }

  /* ---------------------------------------------------------------- cards --- */

  /** A count is shown whole from ten up and to one decimal below ten; the stored value is untouched. */
  function roundedCount(value) {
    return Number.isInteger(value) ? value : value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  }

  function cardFigure(metric) {
    var p = metric.payload;
    if (p && (p.shape === 'ratio' || p.shape === 'share') && p.denominator > 0) {
      var pct = (p.numerator / p.denominator) * 100;
      return (pct >= 10 || pct === 0 ? Math.round(pct) : Math.round(pct * 10) / 10) + '%';
    }
    if (p && p.shape === 'count' && metric.unit) return fmt(roundedCount(p.value)) + ' ' + metric.unit;
    var first = String(metric.valueDisplay).split(/[,;(]/)[0].trim();
    return first || metric.valueDisplay;
  }

  /** Only a leading whole number, alone or followed by %, x, a multiplier or a space, may count up. */
  function countUpEligible(valueDisplay) {
    var m = String(valueDisplay).trim().match(/^\+?(\d[\d,]*)(%|x|×|\s|$)/);
    if (!m) return false;
    var value = Number(m[1].replace(/,/g, ''));
    return isFinite(value) && value > 0;
  }

  function outcomeCardsFor(story) {
    return (story.outcomeCards || []).slice(0, 3).map(function (metric, i) {
      var figure = cardFigure(metric);
      return { key: i + '-' + metric.label, metric: metric, figure: figure, statement: metric.valueDisplay, animate: countUpEligible(figure) };
    });
  }

  /* --------------------------------------------------------------- charts --- */

  var NOTE = {
    comparison: 'Two observation windows, not a controlled comparison.',
    two_value: 'Two summary statistics, not a trend.',
    zero_card: "A zero over a real denominator, from the record's own measurement.",
  };

  function pct(value, denominator) {
    return denominator > 0 ? Math.max(0, Math.min(100, (value / denominator) * 100)) : 0;
  }

  function rowsFor(chart) {
    return chart.parts.map(function (p) {
      var denominator = chart.kind === 'two_value' && chart.axisMax ? chart.axisMax : p.denominator;
      var figure = chart.kind === 'two_value'
        ? fmt(p.value) + (chart.unit ? ' ' + chart.unit : '')
        : fmt(p.value) + ' of ' + fmt(p.denominator);
      return {
        label: p.label, value: p.value, denominator: p.denominator, percent: pct(p.value, denominator),
        status: p.status, statusWord: STATUS_WORD[p.status], caveat: p.caveat, figure: figure,
      };
    });
  }

  function summaryFor(chart, rows) {
    var parts = rows.map(function (r) { return r.label + ' ' + r.figure; }).join('; ');
    switch (chart.kind) {
      case 'composition': return chart.title + ': ' + parts + ', of ' + fmt(chart.denominator) + ' in total.';
      case 'comparison': return chart.title + ': ' + parts + '. ' + NOTE.comparison;
      case 'two_value': return chart.title + ': ' + parts + '. ' + NOTE.two_value;
      case 'zero_card': return chart.title + ': ' + (rows[0] ? rows[0].figure : chart.metric.valueDisplay) + '.';
      default: return chart.title + ': ' + parts + '.';
    }
  }

  function chartsFor(story) {
    var out = [];
    (story.charts || []).forEach(function (chart) {
      var rows = rowsFor(chart);
      if (!rows.length) return;
      out.push({
        key: chart.key, kind: chart.kind, title: chart.title, caption: chart.caption, metric: chart.metric,
        denominator: chart.denominator, unit: chart.unit, axisMax: chart.axisMax, rows: rows, caveat: chart.caveat,
        limitations: chart.limitations || [], summary: summaryFor(chart, rows), note: NOTE[chart.kind] || null,
      });
    });
    return out;
  }

  function compositionRemainder(chart) {
    var sum = chart.rows.reduce(function (acc, r) { return acc + r.value; }, 0);
    return Math.max(0, chart.denominator - sum);
  }

  /* ------------------------------------------------------------- geometry --- */

  var LANE_ORDER = ['primary', 'recovery', 'manual'];
  var H = { boxW: 172, boxWMin: 100, boxWMax: 200, gapX: 64, gapXMin: 24, gapY: 18, laneGap: 30, laneLabel: 26, pad: 16 };
  var V = { boxW: 296, boxWMax: 520, gapY: 44, indent: 20, pad: 16, maxWidth: 360 };
  var LABEL = { charPx: 6.4, padPx: 24, linePx: 15, maxLines: 4, headPx: 30 };
  var LABEL_LIFT = 6;
  var EDGE_LABEL = { charPx: 6, padPx: 8, heightPx: 15, ascentPx: 11 };
  var MIN_RUN = 56;

  function charsPerLine(boxW) { return Math.max(10, Math.floor((boxW - LABEL.padPx) / LABEL.charPx)); }

  function forwardEdges(panel) {
    var state = {};
    var returns = {};
    function visit(k) {
      state[k] = 'open';
      panel.edges.forEach(function (e, i) {
        if (e.from !== k || e.from === e.to) return;
        var s = state[e.to];
        if (s === 'open') returns[i] = true;
        else if (s === undefined) visit(e.to);
      });
      state[k] = 'done';
    }
    panel.nodes.forEach(function (n) { if (!state[n.key]) visit(n.key); });
    return panel.edges.filter(function (e, i) { return !returns[i] && e.from !== e.to; });
  }

  /** Longest-path step per node over the forward edges; every node gets a step. Returns a plain object. */
  function workflowSteps(panel) {
    var keys = panel.nodes.map(function (n) { return n.key; });
    var indegree = {};
    var out = {};
    keys.forEach(function (k) { indegree[k] = 0; out[k] = []; });
    forwardEdges(panel).forEach(function (e) {
      if (!(e.from in indegree) || !(e.to in indegree)) return;
      out[e.from].push(e.to);
      indegree[e.to] += 1;
    });
    var step = {};
    var queue = keys.filter(function (k) { return indegree[k] === 0; });
    queue.forEach(function (k) { step[k] = 0; });
    while (queue.length) {
      var k = queue.shift();
      out[k].forEach(function (next) {
        step[next] = Math.max(step[next] === undefined ? 0 : step[next], step[k] + 1);
        indegree[next] -= 1;
        if (indegree[next] === 0) queue.push(next);
      });
    }
    var tail = -1;
    keys.forEach(function (k) { if (k in step) tail = Math.max(tail, step[k]); });
    keys.forEach(function (k) { if (!(k in step)) step[k] = ++tail; });
    return step;
  }

  function lanesUsed(panel) {
    var present = {};
    panel.nodes.forEach(function (n) { present[n.lane] = true; });
    return LANE_ORDER.filter(function (lane) { return present[lane]; });
  }

  function cubic(x1, y1, cx1, cy1, cx2, cy2, x2, y2) {
    return 'M ' + x1 + ' ' + y1 + ' C ' + cx1 + ' ' + cy1 + ', ' + cx2 + ' ' + cy2 + ', ' + x2 + ' ' + y2;
  }
  function bez(t, a, c1, c2, b) {
    return Math.pow(1 - t, 3) * a + 3 * Math.pow(1 - t, 2) * t * c1 + 3 * (1 - t) * t * t * c2 + t * t * t * b;
  }

  function labelRect(label, x, y) {
    var width = label.length * EDGE_LABEL.charPx + EDGE_LABEL.padPx;
    return { x: x - width / 2, y: y - LABEL_LIFT - EDGE_LABEL.ascentPx, width: width, height: EDGE_LABEL.heightPx };
  }
  function overlaps(a, b, slack) {
    return a.x < b.x + b.width + slack && b.x < a.x + a.width + slack && a.y < b.y + b.height + slack && b.y < a.y + a.height + slack;
  }
  function blocked(boxes, x1, x2, yTop, yBottom, skip) {
    return boxes.some(function (b) {
      return skip.indexOf(b.key) < 0 && b.y <= yBottom && yTop <= b.y + b.height && b.x + b.width > x1 && b.x < x2;
    });
  }
  function nextRowTop(a, boxes, fallback) {
    return boxes.reduce(function (top, b) { return b.y > a.y + a.height && b.y < top ? b.y : top; }, fallback);
  }

  function forward(a, b, boxes, gapX) {
    var x1 = a.x + a.width; var y1 = a.y + a.height / 2;
    var x2 = b.x; var y2 = b.y + b.height / 2;
    if (Math.abs(y2 - y1) < a.height) {
      var dx = Math.max(24, (x2 - x1) / 2);
      return { d: cubic(x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2), labelX: (x1 + x2) / 2, labelY: y1, labelFits: (x2 - x1) >= MIN_RUN };
    }
    var gap = Math.min(gapX, x2 - x1);
    var skip = [a.key, b.key];
    var spans = x2 - x1 > gap + 1;
    var bandClear = !spans || !blocked(boxes, x1, x2, Math.min(y1, y2), Math.max(y1, y2), skip);
    if (bandClear) {
      var xm = (x1 + x2) / 2;
      return { d: cubic(x1, y1, xm, y1, xm, y2, x2, y2), labelX: xm, labelY: (y1 + y2) / 2 + LABEL_LIFT + 4, labelFits: true };
    }
    var xg1 = x1 + gap; var xm1 = x1 + gap / 2;
    var xg2 = x2 - gap; var xm2 = x2 - gap / 2;
    if (!blocked(boxes, x1, x2, y2, y2, skip)) {
      return { d: cubic(x1, y1, xm1, y1, xm1, y2, xg1, y2) + ' L ' + x2 + ' ' + y2, labelX: (xg1 + x2) / 2, labelY: y2, labelFits: true };
    }
    if (!blocked(boxes, x1, x2, y1, y1, skip)) {
      return { d: 'M ' + x1 + ' ' + y1 + ' L ' + xg2 + ' ' + y1 + ' C ' + xm2 + ' ' + y1 + ', ' + xm2 + ' ' + y2 + ', ' + x2 + ' ' + y2, labelX: (x1 + xg2) / 2, labelY: y1, labelFits: true };
    }
    var lower = y2 > y1;
    var ym = lower ? (a.y + a.height + nextRowTop(a, boxes, y2)) / 2 : (b.y + b.height + nextRowTop(b, boxes, y1)) / 2;
    return {
      d: cubic(x1, y1, xm1, y1, xm1, ym, xg1, ym) + ' L ' + xg2 + ' ' + ym + ' C ' + xm2 + ' ' + ym + ', ' + xm2 + ' ' + y2 + ', ' + x2 + ' ' + y2,
      labelX: (xg1 + xg2) / 2, labelY: ym + LABEL_LIFT + 4, labelFits: true,
    };
  }

  function back(a, b, gapY) {
    var x1 = a.x + a.width / 2; var y1 = a.y + a.height;
    var x2 = b.x + b.width / 2; var y2 = b.y + b.height;
    var drop = gapY + 20;
    return {
      d: cubic(x1, y1, x1, y1 + drop, x2, y2 + drop, x2, y2),
      labelX: bez(0.5, x1, x1, x2, x2), labelY: bez(0.5, y1, y1 + drop, y2 + drop, y2), labelFits: true,
    };
  }

  /** The column layout's labels: the routed spot, then the gap below the box left, then the gap above the box entered; else the panel says it. */
  function settleColumnLabels(edges, boxes, gapY) {
    var all = Object.keys(boxes).map(function (k) { return boxes[k]; });
    var placed = [];
    function clear(rect) {
      return !all.some(function (box) { return overlaps(rect, box, 1); }) && !placed.some(function (p) { return overlaps(rect, p, 2); });
    }
    return edges.map(function (e) {
      if (!e.label || !e.labelFits) return e;
      var a = boxes[e.from]; var b = boxes[e.to];
      var spots = [[e.labelX, e.labelY]];
      if (!e.returns) {
        spots.push([a.x + a.width / 2, a.y + a.height + gapY / 2 + LABEL_LIFT + 4]);
        spots.push([b.x + b.width / 2, b.y - gapY / 2 + LABEL_LIFT + 4]);
      }
      for (var i = 0; i < spots.length; i += 1) {
        var rect = labelRect(e.label, spots[i][0], spots[i][1]);
        if (clear(rect)) {
          placed.push(rect);
          var out = {};
          Object.keys(e).forEach(function (k) { out[k] = e[k]; });
          out.labelX = spots[i][0]; out.labelY = spots[i][1];
          return out;
        }
      }
      var hidden = {};
      Object.keys(e).forEach(function (k) { hidden[k] = e[k]; });
      hidden.labelFits = false;
      return hidden;
    });
  }

  function routeHorizontalEdges(panel, boxes, gapX, gapY) {
    var all = Object.keys(boxes).map(function (k) { return boxes[k]; });
    var placed = [];
    return panel.edges.map(function (e) {
      var a = boxes[e.from]; var b = boxes[e.to];
      var returns = b.step <= a.step;
      var r = returns ? back(a, b, gapY) : forward(a, b, all, gapX);
      var labelFits = r.labelFits;
      if (e.label && labelFits) {
        var rect = labelRect(e.label, r.labelX, r.labelY);
        labelFits = !all.some(function (box) { return overlaps(rect, box, 1); })
          && !placed.some(function (p) { return overlaps(rect, p, 2); });
        if (labelFits) placed.push(rect);
      }
      return { from: e.from, to: e.to, d: r.d, labelX: r.labelX, labelY: r.labelY, label: e.label, status: e.status, motion: e.motion, returns: returns, labelFits: labelFits };
    });
  }

  function maxLines(lines) {
    var m = 1;
    Object.keys(lines).forEach(function (k) { m = Math.max(m, lines[k].length); });
    return m;
  }

  function horizontal(panel, steps, maxWidth) {
    var lanes = lanesUsed(panel);
    var boxes = {};
    var bands = [];
    var maxStep = 0;
    Object.keys(steps).forEach(function (k) { maxStep = Math.max(maxStep, steps[k]); });
    var columns = maxStep + 1;
    var boxW = H.boxW; var gapX = H.gapX; var fits = true;
    if (maxWidth !== undefined) {
      var inner = maxWidth - H.pad * 2;
      boxW = Math.min(H.boxWMax, Math.floor((inner - (columns - 1) * H.gapXMin) / columns));
      if (boxW < H.boxWMin) { fits = false; boxW = H.boxWMin; }
      gapX = columns > 1 ? Math.max(H.gapXMin, Math.min(H.gapX, (inner - columns * boxW) / (columns - 1))) : 0;
    }
    var chars = charsPerLine(boxW);
    var lines = {};
    panel.nodes.forEach(function (n) { lines[n.key] = wrapLabel(n.label, chars, LABEL.maxLines); });
    var boxH = LABEL.headPx + LABEL.linePx * maxLines(lines);
    var width = maxWidth !== undefined && fits ? maxWidth : H.pad * 2 + columns * boxW + (columns - 1) * gapX;
    var y = H.pad;
    var nodes = [];
    lanes.forEach(function (lane) {
      var members = panel.nodes.filter(function (n) { return n.lane === lane; });
      var rowsAt = {};
      var top = y + H.laneLabel;
      var rows = 1;
      members.forEach(function (n) {
        var step = steps[n.key] || 0;
        var row = rowsAt[step] || 0;
        rowsAt[step] = row + 1;
        rows = Math.max(rows, row + 1);
        boxes[n.key] = {
          key: n.key, lane: lane, step: step,
          x: H.pad + step * (boxW + gapX), y: top + row * (boxH + H.gapY),
          width: boxW, height: boxH, labelLines: lines[n.key] || [n.label],
        };
        nodes.push(boxes[n.key]);
      });
      var height = H.laneLabel + rows * boxH + (rows - 1) * H.gapY + H.gapY;
      bands.push({ lane: lane, label: panel.laneLabels[lane], x: 0, y: y, width: width, height: height });
      y += height + H.laneGap;
    });
    var height = y - H.laneGap + H.pad;
    var edges = routeHorizontalEdges(panel, boxes, gapX, H.gapY);
    return { orientation: 'horizontal', fits: fits, width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, nodes: nodes, edges: edges, lanes: bands };
  }

  function vertical(panel, steps, maxWidth) {
    var lanes = lanesUsed(panel);
    var laneIndex = {};
    lanes.forEach(function (lane, i) { laneIndex[lane] = i; });
    var ordered = panel.nodes.slice().sort(function (a, b) {
      return (steps[a.key] - steps[b.key]) || (laneIndex[a.lane] - laneIndex[b.lane]);
    });
    var width = maxWidth !== undefined ? Math.max(200, Math.floor(maxWidth)) : V.maxWidth;
    var boxW = Math.min(V.boxWMax, width - V.pad * 2 - (lanes.length - 1) * V.indent);
    var chars = charsPerLine(boxW);
    var lines = {};
    panel.nodes.forEach(function (n) { lines[n.key] = wrapLabel(n.label, chars, LABEL.maxLines); });
    var boxH = LABEL.headPx + LABEL.linePx * maxLines(lines);
    var boxes = {};
    ordered.forEach(function (n, i) {
      boxes[n.key] = {
        key: n.key, lane: n.lane, step: steps[n.key],
        x: V.pad + (laneIndex[n.lane] || 0) * V.indent, y: V.pad + i * (boxH + V.gapY),
        width: boxW, height: boxH, labelLines: lines[n.key] || [n.label],
      };
    });
    var height = V.pad * 2 + ordered.length * boxH + (ordered.length - 1) * V.gapY;
    var routed = panel.edges.map(function (e) {
      var a = boxes[e.from]; var b = boxes[e.to];
      var returns = b.y <= a.y;
      var d, labelX, labelY;
      if (!returns) {
        var x1 = a.x + a.width / 2; var y1 = a.y + a.height;
        var x2 = b.x + b.width / 2; var y2 = b.y;
        var dy = Math.max(12, (y2 - y1) / 2);
        d = cubic(x1, y1, x1, y1 + dy, x2, y2 - dy, x2, y2);
        labelX = bez(0.5, x1, x1, x2, x2); labelY = bez(0.5, y1, y1 + dy, y2 - dy, y2);
      } else {
        var bx1 = a.x + a.width; var by1 = a.y + a.height / 2;
        var bx2 = b.x + b.width; var by2 = b.y + b.height / 2;
        var bulge = 28;
        d = cubic(bx1, by1, bx1 + bulge, by1, bx2 + bulge, by2, bx2, by2);
        labelX = bez(0.5, bx1, bx1 + bulge, bx2 + bulge, bx2); labelY = bez(0.5, by1, by1, by2, by2);
      }
      return { from: e.from, to: e.to, d: d, labelX: labelX, labelY: labelY, label: e.label, status: e.status, motion: e.motion, returns: returns, labelFits: true };
    });
    var edges = settleColumnLabels(routed, boxes, V.gapY);
    var bands = lanes.map(function (lane, i) {
      return { lane: lane, label: panel.laneLabels[lane], x: V.pad + i * V.indent - 6, y: V.pad, width: 3, height: height - V.pad * 2 };
    });
    var nodes = ordered.map(function (n) { return boxes[n.key]; });
    return { orientation: 'vertical', fits: true, width: width, height: height, viewBox: '0 0 ' + width + ' ' + height, nodes: nodes, edges: edges, lanes: bands };
  }

  function orientationFor(viewportWidth) { return viewportWidth >= 768 ? 'horizontal' : 'vertical'; }

  function layoutWorkflow(panel, orientation, options) {
    options = options || {};
    var known = {};
    panel.nodes.forEach(function (n) { known[n.key] = true; });
    var safe = {};
    Object.keys(panel).forEach(function (k) { safe[k] = panel[k]; });
    safe.edges = panel.edges.filter(function (e) { return known[e.from] && known[e.to]; });
    var steps = workflowSteps(safe);
    return orientation === 'horizontal' ? horizontal(safe, steps, options.maxWidth) : vertical(safe, steps, options.maxWidth);
  }

  /* How much wider than its canvas a horizontal drawing may be before stacking
     is the better answer. The SVG is `width: 100%; height: auto`, so a wider
     viewBox is SCALED into the canvas, not clipped or scrolled: at 1.6 the 12px
     node label renders at about 7.5px, the floor for reading it.

     WHY A NARROW CANVAS NO LONGER STACKS THE FLOW. The rule used to fall back to
     the vertical column whenever the horizontal layout could not fit at full
     size, which reads as a different drawing rather than a smaller one: on
     aiflotation.com, whose record column is 1024px against the training site's
     1384, the same twelve-step panel came out as a stack with the lanes gone and
     the edge labels overlapping while the other two sites drew lanes. Ali,
     2026-09-17: "I'm not feeling the chart here. It's just not even close to the
     same effect." Keeping the horizontal composition and letting it shrink holds
     the lanes, the left-to-right reading and the step order at every desk width.
     Kept identical to `storyWorkflowLayout.ts`; `storyVisualShellParity.test.ts`
     compares them. */
  var MAX_SCALE_DOWN = 1.6;

  function layoutWorkflowToFit(panel, viewportWidth, maxWidth) {
    if (orientationFor(viewportWidth) === 'horizontal') {
      var h = layoutWorkflow(panel, 'horizontal', { maxWidth: maxWidth });
      if (h.fits) return h;
      /* A canvas of 0 or less has not been measured yet; the ratio would be
         meaningless, so the unfitted horizontal layout stands. */
      if (maxWidth <= 0 || h.width <= maxWidth * MAX_SCALE_DOWN) return h;
    }
    return layoutWorkflow(panel, 'vertical', { maxWidth: maxWidth });
  }

  return {
    STATUS_WORD: STATUS_WORD, ROLE_WORD: ROLE_WORD, LABEL_LIFT: LABEL_LIFT,
    visualStoryFor: visualStoryFor, panelSelectionOrder: panelSelectionOrder, wrapLabel: wrapLabel,
    cardFigure: cardFigure, countUpEligible: countUpEligible, outcomeCardsFor: outcomeCardsFor,
    chartsFor: chartsFor, compositionRemainder: compositionRemainder,
    workflowSteps: workflowSteps, layoutWorkflow: layoutWorkflow, layoutWorkflowToFit: layoutWorkflowToFit, orientationFor: orientationFor,
  };
});
