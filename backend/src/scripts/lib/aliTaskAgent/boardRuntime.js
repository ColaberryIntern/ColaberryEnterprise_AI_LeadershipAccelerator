/**
 * boardRuntime - the client-side half of the board: cross-filtering, Power BI style.
 *
 * WHY THE CHARTS LIVE IN THE BROWSER
 *
 * Charts rendered once on the server can only hide rows when you filter, which makes them lie:
 * pick one category and the histogram still describes everything. So the page carries its data as
 * JSON and redraws every chart from the current selection.
 *
 * HOW THE CROSS-FILTER WORKS (Ali, 2026-11-11: "clicking on the dashboard allows you to filter the
 * entire dashboard - Power BI like")
 *
 * There are four filter dimensions: category, project, age band, and a single list. Every bar is a
 * button that sets its dimension; clicking the selected bar again clears it. Each chart is drawn
 * with every filter EXCEPT its own dimension, so the chart you clicked keeps all its bars (the
 * unselected ones dimmed) while every other chart, tile and list narrows. That is the Power BI
 * behaviour, and it keeps the way back visible.
 *
 * The age band is task-level, the rest are list-level: filtering to "Dormant" counts only each
 * list's dormant tasks and drops lists that have none.
 *
 * NO PROMPT TEXT IS RENDERED. Prompts reach the clipboard on click. If the clipboard is
 * unavailable the click says "copy blocked by the browser" rather than failing silently.
 */

const RUNTIME_JS = `
(function () {
  var DATA = window.__BOARD__ || { lists: [], prompts: {}, cats: {}, subs: {} };
  DATA.subs = DATA.subs || {};
  var BANDS = [['fresh', 'Not yet due'], ['overdue', 'Overdue'], ['aging', 'Aging'], ['dormant', 'Dormant']];
  var BAND_LABEL = {}; BANDS.forEach(function (b) { BAND_LABEL[b[0]] = b[1]; });
  var F = { cat: null, sub: null, band: null, list: null };

  function sum(a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function catLabel(k) { return (DATA.cats[k] || {}).label || k; }
  function subLabel(k) { return DATA.subs[k] || k; }
  function listName(id) {
    var l = DATA.lists.filter(function (x) { return x.id === id; })[0];
    return l ? l.name : id;
  }

  /* Lists passing every filter except 'except'. The band filter drops lists with none in it. */
  function rows(except) {
    return DATA.lists.filter(function (l) {
      return (except === 'cat' || !F.cat || l.cat === F.cat)
        && (except === 'sub' || !F.sub || l.sub === F.sub)
        && (except === 'list' || !F.list || l.id === F.list)
        && (except === 'band' || !F.band || (l.bands[F.band] || 0) > 0);
    });
  }
  /* A list's task count under the band filter (unless that chart is the band chart itself). */
  function val(l, except) { return F.band && except !== 'band' ? (l.bands[F.band] || 0) : l.total; }
  function dormantOf(l, except) {
    return F.band && except !== 'band' ? (F.band === 'dormant' ? val(l, except) : 0) : l.dormant;
  }

  /* ---- charts ---- */

  /* Every bar is a button: data-dim names the filter it sets, data-val its value. */
  function bars(el, items, dim) {
    if (!el) return;
    var shown = items.filter(function (r) { return r.n > 0; });
    var total = sum(shown, function (r) { return r.n; });
    if (!total) { el.innerHTML = '<p class="empty">Nothing in this selection.</p>'; return; }
    var max = Math.max.apply(null, shown.map(function (r) { return r.n; }));
    var picked = F[dim];
    el.innerHTML = shown.map(function (r) {
      var on = picked === r.key;
      var w = Math.max(2, Math.round((r.n / max) * 100));
      var pct = Math.round((r.n / total) * 100);
      return '<button type="button" class="brow' + (picked && !on ? ' is-dim' : '') + (on ? ' is-on' : '')
        + '" data-dim="' + dim + '" data-val="' + esc(r.key) + '" aria-pressed="' + on + '"'
        + ' title="' + esc(r.label) + ': ' + r.n + ' (' + pct + '%). Click to ' + (on ? 'clear this filter' : 'filter by it') + '.">'
        + '<span class="blab">' + esc(r.label) + '</span>'
        + '<span class="btrack"><span class="bfill" style="width:' + w + '%;background:'
        + (r.color || 'var(--band-overdue)') + '"></span></span>'
        + '<span class="bval">' + r.n + '</span></button>';
    }).join('');
  }

  /* A gauge, because "how much is alive" is one number and a bar chart of one number is junk. */
  function gauge(el, live, total) {
    if (!el) return;
    var pct = total ? Math.round((live / total) * 100) : 0;
    var R = 52, C = Math.PI * R;
    var on = (pct / 100) * C;
    el.innerHTML = '<svg viewBox="0 0 140 84" width="100%" height="84" role="img" aria-label="'
      + live + ' of ' + total + ' tasks are live, ' + pct + ' percent">'
      + '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round"/>'
      /* No arc at 0%: a round line cap on a zero-length dash still paints a dot that reads as "a little". */
      + (pct > 0 ? '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--band-overdue)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '')
      + '<text x="70" y="62" text-anchor="middle" class="g-val">' + pct + '%</text>'
      + '<text x="70" y="78" text-anchor="middle" class="g-cap">live</text></svg>';
  }

  function tiles(el, ls) {
    if (!el) return;
    var total = sum(ls, function (l) { return val(l); });
    var dormant = sum(ls, function (l) { return dormantOf(l); });
    el.innerHTML = [[total, 'tasks'], [total - dormant, 'live'], [dormant, 'dormant'], [ls.length, 'lists']]
      .map(function (d) {
        return '<div class="tile"><div class="tile-value">' + d[0] + '</div><div class="tile-cap">' + d[1] + '</div></div>';
      }).join('');
  }

  function groupSum(ls, keyOf, except) {
    var by = {};
    ls.forEach(function (l) { var k = keyOf(l); by[k] = (by[k] || 0) + val(l, except); });
    return by;
  }

  /* The project slicer row, counted under every filter except its own. */
  function subRow() {
    var el = document.getElementById('subs');
    if (!el) return;
    var by = groupSum(rows('sub'), function (l) { return l.sub; }, 'sub');
    var keys = Object.keys(by).filter(function (k) { return by[k] > 0; }).sort(function (a, b) {
      return by[b] - by[a] || subLabel(a).localeCompare(subLabel(b)); });
    var all = sum(keys, function (k) { return by[k]; });
    el.innerHTML = '<span class="subs-cap">Project</span>'
      + '<button class="subcat' + (!F.sub ? ' is-on' : '') + '" data-dim="sub" data-val="" type="button">All <b>' + all + '</b></button>'
      + keys.map(function (k) {
        return '<button class="subcat' + (F.sub === k ? ' is-on' : '') + '" data-dim="sub" data-val="' + esc(k)
          + '" type="button">' + esc(subLabel(k)) + ' <b>' + by[k] + '</b></button>';
      }).join('');
  }

  /* Active filters as removable pills, so the state is always readable and always undoable. */
  function pills() {
    var el = document.getElementById('f-pills');
    if (!el) return;
    var p = [];
    if (F.cat) p.push(['cat', 'Category', catLabel(F.cat)]);
    if (F.sub) p.push(['sub', 'Project', subLabel(F.sub)]);
    if (F.band) p.push(['band', 'Age', BAND_LABEL[F.band]]);
    if (F.list) p.push(['list', 'List', listName(F.list)]);
    el.innerHTML = p.length
      ? p.map(function (x) {
        return '<button type="button" class="pill" data-clear="' + x[0] + '" title="Remove this filter">'
          + '<span class="pill-k">' + x[1] + '</span> ' + esc(x[2]) + ' <span aria-hidden="true">&times;</span></button>';
      }).join('') + '<button type="button" class="pill pill-all" data-clear="all">Clear all</button>'
      : '<span class="pill-none">No filters. Everything is shown.</span>';
  }

  function redraw() {
    var ls = rows();
    tiles(document.getElementById('f-tiles'), ls);
    gauge(document.getElementById('f-gauge'), sum(ls, function (l) { return val(l) - dormantOf(l); }),
      sum(ls, function (l) { return val(l); }));

    var bl = rows('band');
    bars(document.getElementById('f-bands'), BANDS.map(function (b) {
      return { key: b[0], label: b[1], n: sum(bl, function (l) { return l.bands[b[0]] || 0; }), color: 'var(--band-' + b[0] + ')' };
    }), 'band');

    /* Categories until one is picked; then its projects, because a category compared with only
       itself says nothing. */
    var byProject = !!F.cat;
    var head = document.getElementById('f-cats-h');
    if (head) head.textContent = byProject ? 'By project' : 'By part of the business';
    var dim = byProject ? 'sub' : 'cat';
    var by = groupSum(rows(dim), function (l) { return byProject ? l.sub : l.cat; }, dim);
    bars(document.getElementById('f-cats'), Object.keys(by).map(function (k) {
      return byProject
        ? { key: k, label: subLabel(k), n: by[k], color: (DATA.cats[F.cat] || {}).color }
        : { key: k, label: catLabel(k), n: by[k], color: (DATA.cats[k] || {}).color };
    }).sort(function (a, b) { return b.n - a.n; }), dim);

    bars(document.getElementById('f-lists'), rows('list')
      .map(function (l) { return { key: l.id, label: l.name, n: val(l, 'list'), color: (DATA.cats[l.cat] || {}).color }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 10), 'list');

    /* Chips and cards follow every filter. */
    var keep = {}; ls.forEach(function (l) { keep[l.id] = true; });
    document.querySelectorAll('[data-list]').forEach(function (el) {
      el.classList.toggle('is-hidden', !keep[el.getAttribute('data-list')]);
    });
    document.querySelectorAll('.cat').forEach(function (b) {
      b.classList.toggle('is-on', (b.getAttribute('data-cat') === 'all' && !F.cat) || b.getAttribute('data-cat') === F.cat);
    });
    subRow();
    pills();
    var note = document.getElementById('f-note');
    if (note) {
      var any = F.cat || F.sub || F.band || F.list;
      note.textContent = any
        ? 'Filtered: every number and chart above describes only ' + sum(ls, function (l) { return val(l); }) + ' task(s) in ' + ls.length + ' list(s).'
        : 'Showing everything.';
    }
  }

  function setFilter(dim, v) {
    v = v || null;
    F[dim] = F[dim] === v ? null : v;
    /* A narrower filter chosen under one category may not exist under the next. */
    if (dim === 'cat') { F.sub = null; F.list = null; }
    if (dim === 'sub') { F.list = null; }
    redraw();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t.closest) return;
    var cat = t.closest('.cat');
    if (cat) {
      var c = cat.getAttribute('data-cat');
      F.cat = c === 'all' ? null : c; F.sub = null; F.list = null; redraw(); return;
    }
    var bar = t.closest('[data-dim]');
    if (bar) { setFilter(bar.getAttribute('data-dim'), bar.getAttribute('data-val')); return; }
    var clr = t.closest('[data-clear]');
    if (clr) {
      var d = clr.getAttribute('data-clear');
      if (d === 'all') { F = { cat: null, sub: null, band: null, list: null }; } else { F[d] = null; }
      redraw(); return;
    }

    var chip = t.closest('[data-prompt]');
    if (!chip) return;
    var text = DATA.prompts[chip.getAttribute('data-prompt')];
    var label = chip.querySelector('.chip-label') || chip;
    var was = label.textContent;
    function ok() {
      chip.classList.add('copied'); label.textContent = 'copied - paste into Claude Code';
      setTimeout(function () { chip.classList.remove('copied'); label.textContent = was; }, 1800);
    }
    function fail() {
      chip.classList.add('failed'); label.textContent = 'copy blocked by the browser';
      setTimeout(function () { chip.classList.remove('failed'); label.textContent = was; }, 2600);
    }
    if (!text) { fail(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, fail);
    } else { fail(); }
  });

  redraw();
})();
`;

const RUNTIME_CSS = `
  .fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:14px}
  .fpane{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--surface)}
  .fpane h4{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;
    color:var(--ink-3);font-weight:700}
  .brow{display:flex;align-items:center;gap:9px;margin:0 0 5px;font:12px/1.2 'Segoe UI',system-ui,sans-serif;
    width:100%;background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 4px;
    cursor:pointer;color:inherit;text-align:left}
  .brow:hover{background:color-mix(in srgb,var(--ink) 5%,transparent)}
  .brow:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
  .brow.is-on{border-color:var(--ink-3);background:color-mix(in srgb,var(--ink) 6%,transparent)}
  .brow.is-dim{opacity:.38}
  .blab{flex:0 0 42%;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .btrack{flex:1;background:color-mix(in srgb,var(--ink) 7%,transparent);border-radius:4px;height:11px}
  .bfill{display:block;height:11px;border-radius:4px}
  .bval{flex:0 0 34px;text-align:right;font-weight:700;color:var(--ink)}
  .g-val{font:700 21px 'Segoe UI',system-ui,sans-serif;fill:var(--ink)}
  .g-cap{font:11px 'Segoe UI',system-ui,sans-serif;fill:var(--ink-3)}
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
`;

module.exports = { RUNTIME_JS, RUNTIME_CSS };
