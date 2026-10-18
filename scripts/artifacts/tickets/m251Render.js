/**
 * M25.1 renderers. The visual is a before/after of who carries the ordering, because that single
 * comparison is the whole argument.
 */
const { esc, baseCss, barChart, SEV } = require('../artifactTheme');
const D = require('./m251Data');

const SHARED = `
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .dead { color: ${SEV.bad}; font-weight: 700; }
`;

const tone = (s) => (s.after === 0 ? SEV.bad : (s.after >= 20 ? SEV.ok : '#8aa0b4'));

function sharesChart(width, which) {
  const rows = D.SHARES
    .filter((s) => (which === 'before' ? s.before !== null : true))
    .map((s) => {
      const v = which === 'before' ? (s.before ?? 0) : s.after;
      return {
        label: s.key,
        value: v,
        display: `${v.toFixed(1)}%`,
        color: v === 0 ? '#e2e8f0' : (which === 'before' ? SEV.watch : tone(s)),
      };
    })
    .sort((a, b) => b.value - a.value);
  return barChart({ rows, max: 60, width, barH: 12, gap: 4, labelW: 128 });
}

function sharesTable() {
  const rows = D.SHARES.map((s) => `
    <tr>
      <td><code>${esc(s.key)}</code></td>
      <td class="num">${s.before === null ? '&mdash;' : `${s.before.toFixed(1)}%`}</td>
      <td class="num"><strong>${s.after.toFixed(1)}%</strong></td>
      <td${/CONSTANT|ALWAYS ZERO/.test(s.note) ? ' class="dead"' : ''}>${esc(s.note)}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    <th>Factor</th><th class="num">Before</th><th class="num">After</th><th>What it is</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 8.8pt; }
    h1 { font-size: 14.5pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 9px; }
    .takeaway .headline { font-size: 10pt; } .takeaway .label { font-size: 7pt; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 14.5pt; } .card .k { font-size: 6.3pt; }
    .note { font-size: 7.4pt; padding: 6px 9px; margin: 6px 0; }
    figcaption { font-size: 6.8pt; } code { font-size: 7pt; }`;

  const cards = [
    { n: `${D.POPULATION}`, k: 'people, read-only, both runs' },
    { n: '54.3%', k: 'was carried by a 13%-present factor' },
    { n: '54.6%', k: 'now carried by recency, present for all' },
    { n: '162', k: 'distinct recency values' },
    { n: `${Math.round((D.DEAD.beforePoints / D.DEAD.beforeTotal) * 100)}% to ${Math.round((D.DEAD.afterPoints / D.DEAD.afterTotal) * 100)}%`, k: 'dead weight' },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; The score could not order. Now it can.</h1>
  <div class="meta">${esc(D.MEASURED_ON)} &middot; ${D.POPULATION} production records, read-only
    &middot; nothing written</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The one line worth reading</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>Who carried the ordering BEFORE</h2>
      <figure>${sharesChart(430, 'before')}
        <figcaption>Dominated by <code>intent</code>, present for only 13% of people. The queue
          was sorted largely by whether we happened to have a score at all.</figcaption></figure>
    </div>
    <div>
      <h2>Who carries it AFTER</h2>
      <figure>${sharesChart(430, 'after')}
        <figcaption>Carried by <code>recency</code>: present for everyone, 162 distinct values.
          The grey bars are factors that cannot rank anybody here.</figcaption></figure>
    </div>
  </div>

  <div class="note good">
    <strong>The fix was signal, not calibration.</strong> Reweighting would only have
    redistributed points across factors that mostly are not there. Recency was unblocked by
    letting the DATA declare whether a read was complete, so no caller sees a domain they could
    not see before.
  </div>

  <div class="footer">${esc(D.CODE)} &middot; visual, one page &middot; shares copied from the
    read-only report's own output &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} measure then unblock recency (visual)` };
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}`;

  const verification = D.VERIFICATION.map(([w, r]) => `
    <tr><td><code>${esc(w)}</code></td><td>${esc(r)}</td></tr>`).join('');
  const notEstablished = D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">${esc(D.MEASURED_ON)} &middot; Growth OS reset, Phase 3</div>
  <div class="rule"></div>

  <p><strong>The ticket asked:</strong> ${esc(D.ASKED)}<br>
     <strong>Delivered:</strong> ${esc(D.DELIVERED)}</p>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.TAKEAWAY)}</div>
  </div>

  <h2>1. The measurement that replaced the guess</h2>
  <p>${esc(D.METHOD)}</p>

  <h2>2. Before and after, same population, same method</h2>
  ${sharesTable()}
  <figure>${sharesChart(660, 'after')}
    <figcaption>Share of the ordering after the change. Grey bars carry none of it.
      Dead weight moved from ${D.DEAD.beforePoints}/${D.DEAD.beforeTotal} points to
      ${D.DEAD.afterPoints}/${D.DEAD.afterTotal}; the remaining dead points are population facts,
      not weight errors.</figcaption></figure>

  <h2>3. How recency was unblocked</h2>
  <p><strong>The defect.</strong> ${esc(D.RECENCY_FIX.defect)}</p>
  <div class="note warn"><strong>What the fix was NOT:</strong> ${esc(D.RECENCY_FIX.notTheFix)}</div>
  <p><strong>What it is.</strong> ${esc(D.RECENCY_FIX.theFix)}</p>
  <div class="note good">${esc(D.RECENCY_FIX.guard)}</div>

  <h2>4. What this is not</h2>
  <div class="note warn">${esc(D.NOT_DECISION_5)}</div>

  <h2>5. A merge that lied</h2>
  <div class="note warn">${esc(D.MERGE_THAT_LIED)}</div>

  <h2>6. Verification</h2>
  <table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>${verification}</tbody></table>

  <h2>7. What this does NOT establish</h2>
  <ul>${notEstablished}</ul>

  <div class="footer">${esc(D.CODE)} &middot; document &middot; figures from one data module
    &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} measure then unblock recency` };
}

module.exports = { buildVisual, buildDocument };
