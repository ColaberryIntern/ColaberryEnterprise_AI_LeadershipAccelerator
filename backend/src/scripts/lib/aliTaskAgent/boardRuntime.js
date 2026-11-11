/**
 * boardRuntime - the client-side half of the board: filter, and REBUILD the charts.
 *
 * WHY THE CHARTS MOVED INTO THE BROWSER
 *
 * They used to be SVG rendered once on the server. Filtering could then only hide rows, which
 * made the charts lie: choose "Government contracting" and the age histogram still described the
 * whole backlog while everything beneath it described one category. A chart that does not answer
 * the question currently on screen is worse than no chart.
 *
 * So the page carries its data as JSON and draws every chart from whatever subset is selected.
 * Picking a category re-counts, re-scales and re-labels. The numbers on screen always describe
 * the same set of tasks.
 *
 * NO PROMPT TEXT IS RENDERED. Ali asked for a picture he can click, not a wall of instructions,
 * so the prompts live in a lookup keyed by list and reach the clipboard on click. Nothing is
 * printed. The consequence to be honest about: if the clipboard API is unavailable the prompt is
 * unreachable rather than merely inconvenient, so the failure says so plainly instead of silently
 * doing nothing.
 */

const RUNTIME_JS = `
(function () {
  var DATA = window.__BOARD__ || { lists: [], prompts: {}, cats: {}, subs: {} };
  DATA.subs = DATA.subs || {};
  /* Two levels: sel is the category, selSub the project inside it. Picking a category resets the
     project, because a project chosen under one category may not exist under the next. */
  var sel = 'all';
  var selSub = 'all';

  function inCat() {
    return sel === 'all' ? DATA.lists : DATA.lists.filter(function (l) { return l.cat === sel; });
  }
  function lists() {
    var ls = inCat();
    return selSub === 'all' ? ls : ls.filter(function (l) { return l.sub === selSub; });
  }
  function subLabel(k) { return DATA.subs[k] || k; }

  /* The project row: built from the CATEGORY selection only, so every project that is still
     reachable stays visible while one of them is picked. */
  function subRow() {
    var el = document.getElementById('subs');
    if (!el) return;
    var by = {};
    inCat().forEach(function (l) { by[l.sub] = (by[l.sub] || 0) + l.total; });
    var keys = Object.keys(by).sort(function (a, b) {
      return by[b] - by[a] || subLabel(a).localeCompare(subLabel(b)); });
    var all = sum(inCat(), function (l) { return l.total; });
    el.innerHTML = '<span class="subs-cap">Project</span>'
      + '<button class="subcat' + (selSub === 'all' ? ' is-on' : '') + '" data-sub-pick="all" type="button">All '
      + '<b>' + all + '</b></button>'
      + keys.map(function (k) {
        return '<button class="subcat' + (selSub === k ? ' is-on' : '') + '" data-sub-pick="' + esc(k)
          + '" type="button">' + esc(subLabel(k)) + ' <b>' + by[k] + '</b></button>';
      }).join('');
  }
  function sum(a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---- charts, redrawn from the current selection ---- */

  function bars(el, rows, opts) {
    if (!el) return;
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    var total = sum(rows, function (r) { return r.n; });
    if (!total) { el.innerHTML = '<p class="empty">Nothing in this selection.</p>'; return; }
    el.innerHTML = rows.filter(function (r) { return r.n > 0; }).map(function (r) {
      var w = Math.max(2, Math.round((r.n / max) * 100));
      var pct = Math.round((r.n / total) * 100);
      return '<div class="brow" title="' + esc(r.label) + ': ' + r.n + ' (' + pct + '%)">'
        + '<span class="blab">' + esc(r.label) + '</span>'
        + '<span class="btrack"><span class="bfill" style="width:' + w + '%;background:'
        + (r.color || 'var(--band-overdue)') + '"></span></span>'
        + '<span class="bval">' + r.n + '</span></div>';
    }).join('');
  }

  /* A gauge, because "how much of this is alive" is one number and a bar chart of one number is
     chart junk. The arc is drawn with stroke-dasharray so it needs no library. */
  function gauge(el, live, total) {
    if (!el) return;
    var pct = total ? Math.round((live / total) * 100) : 0;
    var R = 52, C = Math.PI * R; // half circle
    var on = (pct / 100) * C;
    el.innerHTML = '<svg viewBox="0 0 140 84" width="100%" height="84" role="img" aria-label="'
      + live + ' of ' + total + ' tasks are live, ' + pct + ' percent">'
      + '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round"/>'
      + '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--band-overdue)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + ' ' + C.toFixed(1) + '"/>'
      + '<text x="70" y="62" text-anchor="middle" class="g-val">' + pct + '%</text>'
      + '<text x="70" y="78" text-anchor="middle" class="g-cap">live</text></svg>';
  }

  function tiles(el, ls) {
    if (!el) return;
    var total = sum(ls, function (l) { return l.total; });
    var dormant = sum(ls, function (l) { return l.dormant; });
    var def = [
      { v: total, c: 'tasks' }, { v: total - dormant, c: 'live' },
      { v: dormant, c: 'dormant' }, { v: ls.length, c: 'lists' },
    ];
    el.innerHTML = def.map(function (d) {
      return '<div class="tile"><div class="tile-value">' + d.v + '</div>'
        + '<div class="tile-cap">' + d.c + '</div></div>';
    }).join('');
  }

  function redraw() {
    var ls = lists();
    tiles(document.getElementById('f-tiles'), ls);
    gauge(document.getElementById('f-gauge'), sum(ls, function (l) { return l.live; }),
      sum(ls, function (l) { return l.total; }));

    bars(document.getElementById('f-bands'), [
      { label: 'Not yet due', n: sum(ls, function (l) { return l.bands.fresh || 0; }), color: 'var(--band-fresh)' },
      { label: 'Overdue', n: sum(ls, function (l) { return l.bands.overdue || 0; }), color: 'var(--band-overdue)' },
      { label: 'Aging', n: sum(ls, function (l) { return l.bands.aging || 0; }), color: 'var(--band-aging)' },
      { label: 'Dormant', n: sum(ls, function (l) { return l.bands.dormant || 0; }), color: 'var(--band-dormant)' }
    ]);

    /* With nothing picked this pane compares categories. Once one is picked, comparing it with
       itself says nothing, so the pane drops a level and compares its projects instead. */
    var byProject = sel !== 'all' || selSub !== 'all';
    var head = document.getElementById('f-cats-h');
    if (head) head.textContent = byProject ? 'By project' : 'By part of the business';
    var byKey = {};
    (byProject ? ls : DATA.lists).forEach(function (l) {
      var k = byProject ? l.sub : l.cat;
      byKey[k] = (byKey[k] || 0) + l.total;
    });
    bars(document.getElementById('f-cats'), Object.keys(byKey).map(function (k) {
      return byProject
        ? { label: subLabel(k), n: byKey[k], color: sel === 'all' ? 'var(--ink-3)' : (DATA.cats[sel] || {}).color }
        : { label: (DATA.cats[k] || {}).label || k, n: byKey[k], color: (DATA.cats[k] || {}).color };
    }).sort(function (a, b) { return b.n - a.n; }));

    bars(document.getElementById('f-lists'), ls.slice()
      .sort(function (a, b) { return b.total - a.total; }).slice(0, 10)
      .map(function (l) { return { label: l.name, n: l.total, color: (DATA.cats[l.cat] || {}).color }; }));

    document.querySelectorAll('[data-cat]').forEach(function (el) {
      if (el.classList.contains('cat')) return;
      el.classList.toggle('is-hidden',
        (sel !== 'all' && el.getAttribute('data-cat') !== sel)
        || (selSub !== 'all' && el.getAttribute('data-sub') !== selSub));
    });
    subRow();
    document.querySelectorAll('.cat').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-cat') === sel);
    });
    var note = document.getElementById('f-note');
    if (note) {
      var path = (sel === 'all' ? 'Everything' : ((DATA.cats[sel] || {}).label || sel))
        + (selSub === 'all' ? '' : ' / ' + subLabel(selSub));
      note.textContent = sel === 'all' && selSub === 'all'
        ? 'Showing everything.'
        : 'Filtered to ' + path + '. Every number and chart above describes only this selection.';
    }
  }

  document.addEventListener('click', function (ev) {
    var cat = ev.target.closest && ev.target.closest('.cat');
    if (cat) { sel = cat.getAttribute('data-cat'); selSub = 'all'; redraw(); return; }

    var sub = ev.target.closest && ev.target.closest('[data-sub-pick]');
    if (sub) { selSub = sub.getAttribute('data-sub-pick'); redraw(); return; }

    var chip = ev.target.closest && ev.target.closest('[data-prompt]');
    if (!chip) return;
    var key = chip.getAttribute('data-prompt');
    var text = DATA.prompts[key];
    if (!text) { chip.classList.add('failed'); return; }
    var label = chip.querySelector('.chip-label') || chip;
    var was = label.textContent;
    function ok() {
      chip.classList.add('copied'); label.textContent = 'copied - paste into Claude Code';
      setTimeout(function () { chip.classList.remove('copied'); label.textContent = was; }, 1800);
    }
    function fail() {
      /* The prompt is not rendered anywhere, so a clipboard failure makes it unreachable rather
         than inconvenient. Say so instead of doing nothing visible. */
      chip.classList.add('failed'); label.textContent = 'copy blocked by the browser';
      setTimeout(function () { chip.classList.remove('failed'); label.textContent = was; }, 2600);
    }
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
  .brow{display:flex;align-items:center;gap:9px;margin-bottom:7px;font-size:12px}
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
  .chip.copied{background:var(--band-overdue);color:#fff;border-color:var(--band-overdue)}
  .chip.failed{background:var(--band-aging);color:#fff;border-color:var(--band-aging)}
`;

module.exports = { RUNTIME_JS, RUNTIME_CSS };
