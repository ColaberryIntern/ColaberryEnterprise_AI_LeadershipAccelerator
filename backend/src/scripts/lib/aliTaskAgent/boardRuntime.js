/**
 * boardRuntime - the client-side half of the board: cross-filtering, Power BI style.
 *
 * THE MODEL: ONE ROW PER TASK
 *
 * The page ships a small fact table, one compact row per task: [listIndex, band, period, kind].
 * Each list carries its category, project and Basecamp shape. Every number on the page is a count
 * of the facts that pass the current filters, so ANY combination of filters is exact, including
 * two task-level ones together ("dormant" AND "due in 2026 Q3"), which per-list totals cannot
 * answer. 515 tasks is ~10 KB, so this costs nothing.
 *
 * SEVEN DIMENSIONS, ALL CLICKABLE (Ali, 2026-11-11: "filter the entire dashboard - Power BI like",
 * then "make it even more interactive to slice through the data")
 *
 *   cat     category              sub    project             list    one list
 *   band    age band              period quarter due         kind    who does the work
 *   shape   real list / group inside a list / deleted in Basecamp
 *
 * Each chart is drawn with every filter EXCEPT its own dimension(s), so the chart you clicked keeps
 * its other marks (dimmed) while everything else narrows. Clicking a selected mark clears it.
 *
 * NO PROMPT TEXT IS RENDERED. Prompts reach the clipboard on click; a blocked clipboard says so.
 */
const { CHARTS_JS, CHARTS_CSS } = require('./boardCharts');

const CORE_JS = `
  var DATA = window.__BOARD__ || { lists: [], facts: [], prompts: {}, cats: {}, subs: {} };
  var L = DATA.lists || [], FACTS = DATA.facts || [];
  DATA.subs = DATA.subs || {};
  var DIMS = ['cat', 'sub', 'list', 'band', 'period', 'kind', 'shape'];
  var BANDS = [['fresh', 'Not yet due'], ['overdue', 'Overdue'], ['aging', 'Aging'], ['dormant', 'Dormant']];
  var KINDS = [['person', 'Needs a person'], ['generated', 'Machine-generated'], ['hand', 'Hand-written']];
  var SHAPES = [['list', 'Real list'], ['group', 'Group inside a list'], ['gone', 'Deleted in Basecamp'], ['unknown', 'Not checked']];
  var LABEL = { band: {}, kind: {}, shape: {} };
  BANDS.forEach(function (b) { LABEL.band[b[0]] = b[1]; });
  KINDS.forEach(function (b) { LABEL.kind[b[0]] = b[1]; });
  SHAPES.forEach(function (b) { LABEL.shape[b[0]] = b[1]; });
  var DIM_NAME = { cat: 'Category', sub: 'Project', list: 'List', band: 'Age', period: 'Due', kind: 'Who', shape: 'Basecamp' };
  var F = {}; DIMS.forEach(function (d) { F[d] = null; });

  function dimOf(t, d) {
    var l = L[t[0]] || {};
    switch (d) {
      case 'cat': return l.cat; case 'sub': return l.sub; case 'list': return l.id;
      case 'band': return t[1]; case 'period': return t[2]; case 'kind': return t[3];
      case 'shape': return l.shape || 'unknown';
    }
    return null;
  }
  /* Facts passing every filter except the given dimension(s). */
  function facts(except) {
    var ex = [].concat(except || []);
    return FACTS.filter(function (t) {
      for (var i = 0; i < DIMS.length; i++) {
        var d = DIMS[i];
        if (ex.indexOf(d) < 0 && F[d] != null && dimOf(t, d) !== F[d]) return false;
      }
      return true;
    });
  }
  function countBy(ts, d) { var by = {}; ts.forEach(function (t) { var k = dimOf(t, d); by[k] = (by[k] || 0) + 1; }); return by; }
  function catLabel(k) { return (DATA.cats[k] || {}).label || k; }
  function subLabel(k) { return DATA.subs[k] || k; }
  function listOf(id) { return L.filter(function (l) { return l.id === id; })[0] || {}; }
  function periodLabel(p) { return p === 'none' ? 'No due date' : p.replace('-', ' '); }
  function periodShort(p) { return p === 'none' ? 'none' : p.slice(5) + " '" + p.slice(2, 4); }
  function label(d, v) {
    if (d === 'cat') return catLabel(v); if (d === 'sub') return subLabel(v);
    if (d === 'list') return listOf(v).name || v; if (d === 'period') return periodLabel(v);
    return (LABEL[d] || {})[v] || v;
  }

  function tiles(ts) {
    var el = document.getElementById('f-tiles'); if (!el) return;
    var by = countBy(ts, 'band'), kinds = countBy(ts, 'kind');
    var lists = {}; ts.forEach(function (t) { lists[t[0]] = 1; });
    var dormant = by.dormant || 0, overdue = (by.overdue || 0) + (by.aging || 0);
    el.innerHTML = [[ts.length, 'tasks', null, null], [ts.length - dormant, 'live', null, null],
      [overdue, 'overdue or aging', null, null], [dormant, 'dormant', 'band', 'dormant'],
      [kinds.person || 0, 'need a person', 'kind', 'person'], [Object.keys(lists).length, 'lists', null, null]]
      .map(function (d) {
        var inner = '<div class="tile-value">' + d[0] + '</div><div class="tile-cap">' + d[1] + '</div>';
        if (!d[2]) return '<div class="tile">' + inner + '</div>';
        var on = F[d[2]] === d[3];
        return '<button type="button" class="tile tile-btn' + (on ? ' is-on' : '') + '" data-dim="' + d[2]
          + '" data-val="' + d[3] + '" aria-pressed="' + on + '" title="Click to ' + (on ? 'clear' : 'filter to') + ' ' + d[1] + '">' + inner + '</button>';
      }).join('');
  }

  function subRow() {
    var el = document.getElementById('subs'); if (!el) return;
    var by = countBy(facts('sub'), 'sub');
    var keys = Object.keys(by).sort(function (a, b) { return by[b] - by[a] || subLabel(a).localeCompare(subLabel(b)); });
    el.innerHTML = '<span class="subs-cap">Project</span>'
      + '<button class="subcat' + (!F.sub ? ' is-on' : '') + '" data-dim="sub" data-val="" type="button">All <b>'
      + sum(keys, function (k) { return by[k]; }) + '</b></button>'
      + keys.map(function (k) {
        return '<button class="subcat' + (F.sub === k ? ' is-on' : '') + '" data-dim="sub" data-val="' + esc(k)
          + '" type="button">' + esc(subLabel(k)) + ' <b>' + by[k] + '</b></button>';
      }).join('');
  }

  function pills() {
    var el = document.getElementById('f-pills'); if (!el) return;
    var on = DIMS.filter(function (d) { return F[d] != null; });
    el.innerHTML = on.length
      ? on.map(function (d) {
        return '<button type="button" class="pill" data-clear="' + d + '" title="Remove this filter"><span class="pill-k">'
          + DIM_NAME[d] + '</span> ' + esc(label(d, F[d])) + ' <span aria-hidden="true">&times;</span></button>';
      }).join('') + '<button type="button" class="pill pill-all" data-clear="all">Clear all</button>'
      : '<span class="pill-none">No filters. Everything is shown. Click any bar, column, cell or tile below.</span>';
  }

  function redraw() {
    var all = facts();
    tiles(all);
    var bandsAll = countBy(all, 'band');
    gauge(document.getElementById('f-gauge'), all.length - (bandsAll.dormant || 0), all.length);

    var b = countBy(facts('band'), 'band');
    hbars(document.getElementById('f-bands'), BANDS.map(function (x) {
      return { key: x[0], label: x[1], n: b[x[0]] || 0, color: 'var(--band-' + x[0] + ')' }; }), 'band', F.band);

    /* Categories until one is picked, then its projects. */
    var rowDim = F.cat ? 'sub' : 'cat';
    var head = document.getElementById('f-cats-h');
    if (head) head.textContent = F.cat ? 'By project' : 'By part of the business';
    var c = countBy(facts(rowDim), rowDim);
    hbars(document.getElementById('f-cats'), Object.keys(c).map(function (k) {
      return { key: k, label: label(rowDim, k), n: c[k], color: (DATA.cats[F.cat || k] || {}).color };
    }).sort(function (x, y) { return y.n - x.n; }), rowDim, F[rowDim]);

    var li = countBy(facts('list'), 'list');
    hbars(document.getElementById('f-lists'), Object.keys(li).map(function (k) {
      var l = listOf(k);
      return { key: k, label: l.name || k, n: li[k], color: (DATA.cats[l.cat] || {}).color };
    }).sort(function (x, y) { return y.n - x.n; }).slice(0, 10), 'list', F.list);

    var kd = countBy(facts('kind'), 'kind');
    hbars(document.getElementById('f-kind'), KINDS.map(function (x) {
      return { key: x[0], label: x[1], n: kd[x[0]] || 0, color: 'var(--ink-2)' }; }), 'kind', F.kind);

    var sh = countBy(facts('shape'), 'shape');
    hbars(document.getElementById('f-shape'), SHAPES.map(function (x) {
      return { key: x[0], label: x[1], n: sh[x[0]] || 0, color: x[0] === 'gone' ? 'var(--band-dormant)' : 'var(--ink-2)' }; }), 'shape', F.shape);

    /* Due quarters in time order, every quarter in the span shown so gaps are visible. */
    var pd = countBy(facts('period'), 'period');
    var dated = Object.keys(pd).filter(function (k) { return k !== 'none'; }).sort();
    var axis = [];
    if (dated.length) {
      var y = +dated[0].slice(0, 4), q = +dated[0].slice(6), endY = +dated[dated.length - 1].slice(0, 4), endQ = +dated[dated.length - 1].slice(6);
      while (y < endY || (y === endY && q <= endQ)) { axis.push(y + '-Q' + q); q++; if (q > 4) { q = 1; y++; } }
    }
    if (pd.none) axis.push('none');
    columns(document.getElementById('f-period'), axis.map(function (k) {
      return { key: k, label: periodLabel(k), short: periodShort(k), n: pd[k] || 0 }; }), 'period', F.period);

    /* Heatmap: rows are categories (or projects once a category is picked), columns age bands. */
    var hm = facts([rowDim, 'band']);
    var grid = {}; hm.forEach(function (t) { var k = dimOf(t, rowDim) + '|' + t[1]; grid[k] = (grid[k] || 0) + 1; });
    var rowTot = countBy(hm, rowDim);
    var rowsDef = Object.keys(rowTot).sort(function (x, y2) { return rowTot[y2] - rowTot[x]; })
      .map(function (k) { return { key: k, label: label(rowDim, k) }; });
    var hh = document.getElementById('f-heat-h');
    if (hh) hh.textContent = (F.cat ? 'Project' : 'Category') + ' \\u00d7 age: where the old work sits';
    heatmap(document.getElementById('f-heat'), rowsDef, BANDS.map(function (x) { return { key: x[0], label: x[1] }; }),
      function (r, col) { return grid[r + '|' + col] || 0; }, rowDim, 'band', F[rowDim], F.band);

    var keep = {}; all.forEach(function (t) { keep[(L[t[0]] || {}).id] = true; });
    document.querySelectorAll('[data-list]').forEach(function (el) {
      el.classList.toggle('is-hidden', !keep[el.getAttribute('data-list')]);
    });
    document.querySelectorAll('.cat').forEach(function (bt) {
      bt.classList.toggle('is-on', (bt.getAttribute('data-cat') === 'all' && !F.cat) || bt.getAttribute('data-cat') === F.cat);
    });
    subRow();
    pills();
    var note = document.getElementById('f-note');
    if (note) {
      var lists = {}; all.forEach(function (t) { lists[t[0]] = 1; });
      note.textContent = DIMS.some(function (d) { return F[d] != null; })
        ? 'Filtered: every number and chart describes only these ' + all.length + ' task(s) in ' + Object.keys(lists).length + ' list(s).'
        : 'Showing everything.';
    }
  }

  function setFilter(dim, v) {
    v = v === '' || v == null ? null : v;
    F[dim] = F[dim] === v ? null : v;
    /* A narrower pick made under one category may not exist under the next. */
    if (dim === 'cat') { F.sub = null; F.list = null; }
    if (dim === 'sub') { F.list = null; }
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var cat = t.closest('.cat');
    if (cat) { var c = cat.getAttribute('data-cat'); F.cat = c === 'all' ? null : c; F.sub = null; F.list = null; redraw(); return; }
    var two = t.closest('[data-dim2]');
    if (two) {
      var dims = two.getAttribute('data-dim2').split('|'), vals = two.getAttribute('data-val2').split('|');
      var same = F[dims[0]] === vals[0] && F[dims[1]] === vals[1];
      if (same) { F[dims[0]] = null; F[dims[1]] = null; } else { setFilter(dims[0], null); F[dims[0]] = vals[0]; if (dims[0] === 'cat') { F.sub = null; F.list = null; } F[dims[1]] = vals[1]; }
      redraw(); return;
    }
    var mark = t.closest('[data-dim]');
    if (mark) { setFilter(mark.getAttribute('data-dim'), mark.getAttribute('data-val')); redraw(); return; }
    var clr = t.closest('[data-clear]');
    if (clr) {
      var d = clr.getAttribute('data-clear');
      if (d === 'all') { DIMS.forEach(function (x) { F[x] = null; }); } else { F[d] = null; }
      redraw(); return;
    }

    var chip = t.closest('[data-prompt]');
    if (!chip) return;
    var text = DATA.prompts[chip.getAttribute('data-prompt')];
    var lab = chip.querySelector('.chip-label') || chip;
    var was = lab.textContent;
    function ok() { chip.classList.add('copied'); lab.textContent = 'copied - paste into Claude Code';
      setTimeout(function () { chip.classList.remove('copied'); lab.textContent = was; }, 1800); }
    function fail() { chip.classList.add('failed'); lab.textContent = 'copy blocked by the browser';
      setTimeout(function () { chip.classList.remove('failed'); lab.textContent = was; }, 2600); }
    if (!text) { fail(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, fail); } else { fail(); }
  });

  redraw();
`;

const RUNTIME_JS = `(function () {\n${CHARTS_JS}\n${CORE_JS}\n})();`;

const RUNTIME_CSS = `
  .fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:14px}
  .fpane{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface);min-width:0}
  .fpane.wide{grid-column:1/-1}
  .fpane h4{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;
    color:var(--ink-3);font-weight:700}
  .fpane .hint{font-size:11px;color:var(--ink-3);margin:-6px 0 8px}
  .tile-btn{cursor:pointer;text-align:left;background:transparent;color:inherit;font:inherit}
  .tile-btn:hover{border-color:var(--ink-3)}
  .tile-btn.is-on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
  #f-note{font-size:12px;color:var(--ink-3);margin-top:12px}
  .subs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 2px}
  .subs-cap{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--ink-3);
    font-weight:700;margin-right:4px}
  .subcat{cursor:pointer;border:1px solid var(--line);background:transparent;color:var(--ink-2);
    border-radius:999px;padding:4px 10px;font:12px/1.2 'Segoe UI',system-ui,sans-serif}
  .subcat b{color:var(--ink);font-weight:700;margin-left:2px}
  .subcat:hover{border-color:var(--ink-3)}
  .subcat.is-on{border-color:var(--brand);color:var(--ink);box-shadow:inset 0 0 0 1px var(--brand)}
  .pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px;min-height:26px}
  .pill{cursor:pointer;border:1px solid var(--brand);background:color-mix(in srgb,var(--brand) 7%,transparent);
    color:var(--ink);border-radius:999px;padding:3px 10px;font:12px/1.3 'Segoe UI',system-ui,sans-serif}
  .pill-k{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);font-weight:700}
  .pill-all{border-color:var(--line);background:transparent;color:var(--ink-2)}
  .pill-none{font-size:12px;color:var(--ink-3)}
  .chip.copied,.getp.copied{background:var(--band-overdue);color:#fff}
  .chip.failed,.getp.failed{background:var(--band-aging);color:#fff}
  ${CHARTS_CSS}
`;

module.exports = { RUNTIME_JS, RUNTIME_CSS };
