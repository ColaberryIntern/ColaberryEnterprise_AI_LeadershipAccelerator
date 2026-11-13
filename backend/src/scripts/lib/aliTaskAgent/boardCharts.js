/**
 * boardCharts - the chart primitives the board's runtime draws with (browser code, as a string).
 *
 * Every mark that can filter is a <button> carrying data-dim (the filter it sets) and data-val (its
 * value), so a chart is clickable and keyboard-reachable by construction. A selected mark is
 * outlined and pressed; its siblings dim rather than disappear, so the way back stays visible.
 *
 * Colour follows the job (dataviz skill): categories keep their validated categorical hue, age
 * bands their band ramp, and magnitude in the heatmap a one-hue sequential ramp validated on
 * 2026-11-11 with validateOrdinal in both modes (monotone lightness, adjacent dL >= 0.06, light end
 * >= 2:1 vs surface, single hue). Cell labels use text tokens chosen per step for >= 4.5:1.
 *
 * Kept separate from boardRuntime so neither file approaches the 500-line ceiling.
 */

/** Heatmap ramp, low -> high, with the label ink that clears 4.5:1 on each step. */
const HEAT = {
  light: { steps: ['#7fb2f5', '#4f8ff0', '#2563eb', '#1e40af', '#172554'],
    ink: ['#0f172a', '#0f172a', '#ffffff', '#ffffff', '#ffffff'] },
  dark: { steps: ['#3557b4', '#4f84eb', '#6b9cf2', '#86b3f7', '#c4dcfc'],
    ink: ['#ffffff', '#0f172a', '#0f172a', '#0f172a', '#0f172a'] },
};

/** CSS custom properties for the ramp, one block per mode. */
const heatVars = (mode) => HEAT[mode].steps
  .map((c, i) => `--heat-${i}:${c};--heat-ink-${i}:${HEAT[mode].ink[i]};`).join('');

const CHARTS_JS = `
  function sum(a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function markCls(base, picked, key) {
    var on = picked != null && picked === key;
    return base + (picked != null && !on ? ' is-dim' : '') + (on ? ' is-on' : '');
  }
  function tip(label, n, total, on) {
    return esc(label) + ': ' + n + (total ? ' (' + Math.round((n / total) * 100) + '%)' : '')
      + '. Click to ' + (on ? 'clear this filter' : 'filter by it') + '.';
  }

  /* Horizontal bars. items: [{key,label,n,color}] */
  function hbars(el, items, dim, picked) {
    if (!el) return;
    var shown = items.filter(function (r) { return r.n > 0; });
    var total = sum(shown, function (r) { return r.n; });
    if (!total) { el.innerHTML = '<p class="empty">Nothing in this selection.</p>'; return; }
    var max = Math.max.apply(null, shown.map(function (r) { return r.n; }));
    el.innerHTML = shown.map(function (r) {
      var on = picked === r.key;
      return '<button type="button" class="' + markCls('brow', picked, r.key) + '" data-dim="' + dim
        + '" data-val="' + esc(r.key) + '" aria-pressed="' + on + '" title="' + tip(r.label, r.n, total, on) + '">'
        + '<span class="blab">' + esc(r.label) + '</span>'
        + '<span class="btrack"><span class="bfill" style="width:' + Math.max(2, Math.round((r.n / max) * 100))
        + '%;background:' + (r.color || 'var(--ink-3)') + '"></span></span>'
        + '<span class="bval">' + r.n + '</span></button>';
    }).join('');
  }

  /* Vertical columns for an ordered axis (time). Zero columns stay, so gaps in time are visible. */
  function columns(el, items, dim, picked) {
    if (!el) return;
    var total = sum(items, function (r) { return r.n; });
    if (!total) { el.innerHTML = '<p class="empty">Nothing in this selection.</p>'; return; }
    var max = Math.max.apply(null, items.map(function (r) { return r.n; }));
    el.innerHTML = '<div class="cols">' + items.map(function (r) {
      var on = picked === r.key;
      var h = r.n ? Math.max(3, Math.round((r.n / max) * 100)) : 0;
      return '<button type="button" class="' + markCls('col', picked, r.key) + '" data-dim="' + dim
        + '" data-val="' + esc(r.key) + '" aria-pressed="' + on + '" title="' + tip(r.label, r.n, total, on) + '"'
        + (r.n ? '' : ' disabled') + '>'
        + '<span class="col-n">' + (r.n || '') + '</span>'
        + '<span class="col-track"><span class="col-fill" style="height:' + h + '%;background:'
        + (r.color || 'var(--band-overdue)') + '"></span></span>'
        + '<span class="col-lab">' + esc(r.short || r.label) + '</span></button>';
    }).join('') + '</div>';
  }

  /* A heatmap of two dimensions. Clicking a cell sets BOTH filters. */
  function heatmap(el, rowsDef, colsDef, cell, rowDim, colDim, pickedRow, pickedCol) {
    if (!el) return;
    var max = 0;
    rowsDef.forEach(function (r) { colsDef.forEach(function (c) { max = Math.max(max, cell(r.key, c.key)); }); });
    if (!max) { el.innerHTML = '<p class="empty">Nothing in this selection.</p>'; return; }
    var any = pickedRow != null || pickedCol != null;
    var head = '<div class="hm-row hm-head"><span class="hm-rlab"></span>' + colsDef.map(function (c) {
      return '<span class="hm-clab">' + esc(c.label) + '</span>'; }).join('') + '</div>';
    el.innerHTML = '<div class="hm">' + head + rowsDef.map(function (r) {
      return '<div class="hm-row"><span class="hm-rlab" title="' + esc(r.label) + '">' + esc(r.label) + '</span>'
        + colsDef.map(function (c) {
          var n = cell(r.key, c.key);
          var on = pickedRow === r.key && pickedCol === c.key;
          var dim = any && !on && !((pickedRow == null || pickedRow === r.key) && (pickedCol == null || pickedCol === c.key));
          if (!n) return '<span class="hm-cell hm-zero" title="' + esc(r.label) + ' / ' + esc(c.label) + ': 0">&middot;</span>';
          var step = Math.min(4, Math.floor((n / max) * 5 - 1e-9));
          return '<button type="button" class="hm-cell' + (on ? ' is-on' : '') + (dim ? ' is-dim' : '')
            + '" data-dim2="' + rowDim + '|' + colDim + '" data-val2="' + esc(r.key) + '|' + esc(c.key) + '"'
            + ' aria-pressed="' + on + '" style="background:var(--heat-' + step + ');color:var(--heat-ink-' + step + ')"'
            + ' title="' + esc(r.label) + ' / ' + esc(c.label) + ': ' + n + '. Click to filter by both.">' + n + '</button>';
        }).join('') + '</div>';
    }).join('') + '</div>';
  }

  /* A gauge, because "how much is alive" is one number and a bar chart of one number is junk. */
  function gauge(el, live, total) {
    if (!el) return;
    var pct = total ? Math.round((live / total) * 100) : 0;
    var R = 52, C = Math.PI * R, on = (pct / 100) * C;
    el.innerHTML = '<svg viewBox="0 0 140 84" width="100%" height="84" role="img" aria-label="'
      + live + ' of ' + total + ' tasks are live, ' + pct + ' percent">'
      + '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--line)" stroke-width="12" stroke-linecap="round"/>'
      /* No arc at 0%: a round cap on a zero-length dash still paints a dot that reads as "a little". */
      + (pct > 0 ? '<path d="M 18 72 A ' + R + ' ' + R + ' 0 0 1 122 72" fill="none" stroke="var(--band-overdue)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + on.toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '')
      + '<text x="70" y="62" text-anchor="middle" class="g-val">' + pct + '%</text>'
      + '<text x="70" y="78" text-anchor="middle" class="g-cap">live</text></svg>';
  }
`;

const CHARTS_CSS = `
  .brow{display:flex;align-items:center;gap:9px;margin:0 0 5px;font:12px/1.2 'Segoe UI',system-ui,sans-serif;
    width:100%;background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 4px;
    cursor:pointer;color:inherit;text-align:left}
  .brow:hover,.col:hover:not([disabled]){background:color-mix(in srgb,var(--ink) 5%,transparent)}
  .brow:focus-visible,.col:focus-visible,.hm-cell:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
  .brow.is-on,.col.is-on{border-color:var(--ink-3);background:color-mix(in srgb,var(--ink) 6%,transparent)}
  .is-dim{opacity:.38}
  .blab{flex:0 0 42%;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .btrack{flex:1;background:color-mix(in srgb,var(--ink) 7%,transparent);border-radius:4px;height:11px}
  .bfill{display:block;height:11px;border-radius:4px}
  .bval{flex:0 0 34px;text-align:right;font-weight:700;color:var(--ink)}
  .cols{display:flex;align-items:stretch;gap:3px;height:170px;overflow-x:auto;padding-bottom:2px}
  .col{flex:1 0 34px;display:flex;flex-direction:column;align-items:center;gap:3px;background:transparent;
    border:1px solid transparent;border-radius:6px;padding:2px 1px;cursor:pointer;color:inherit;
    font:11px/1.1 'Segoe UI',system-ui,sans-serif}
  .col[disabled]{cursor:default}
  .col-n{font-weight:700;color:var(--ink);min-height:12px}
  .col-track{flex:1;width:70%;display:flex;align-items:flex-end}
  .col-fill{display:block;width:100%;border-radius:4px 4px 0 0}
  .col-lab{color:var(--ink-3);white-space:nowrap;font-size:10px}
  .hm{display:grid;gap:3px;font:12px/1.2 'Segoe UI',system-ui,sans-serif;overflow-x:auto}
  .hm-row{display:grid;grid-template-columns:minmax(120px,1.4fr) repeat(4,minmax(54px,1fr));gap:3px;align-items:center}
  .hm-head .hm-clab{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);
    font-weight:700;text-align:center}
  .hm-rlab{color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hm-cell{height:30px;border:2px solid var(--surface);border-radius:6px;font-weight:700;cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .hm-cell.is-on{outline:2px solid var(--ink);outline-offset:-2px}
  .hm-zero{color:var(--ink-3);cursor:default;background:color-mix(in srgb,var(--ink) 4%,transparent)}
  .g-val{font:700 21px 'Segoe UI',system-ui,sans-serif;fill:var(--ink)}
  .g-cap{font:11px 'Segoe UI',system-ui,sans-serif;fill:var(--ink-3)}
`;

module.exports = { CHARTS_JS, CHARTS_CSS, HEAT, heatVars };
