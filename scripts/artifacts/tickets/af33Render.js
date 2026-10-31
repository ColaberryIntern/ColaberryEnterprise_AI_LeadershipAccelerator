/**
 * AF3.3's one-page visual and its spec document.
 *
 * The visual leads with the CORRECTION rather than the map, because the map is the expected
 * deliverable and the correction is the thing that changes a decision: the record said five
 * undomained agents were live, and thirteen are, with 1.49 million runs between them.
 *
 * It also has to say, in the loudest place available, that this ticket does NOT close. Its own
 * fifth criterion is BLOCKED - ALI DECISION REQUIRED, and an artifact that reads as "all done"
 * would invite exactly the close the ticket forbids.
 */
const D = require('./af33Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; measured in production ${D.MEASURED_ON} `
  + `&middot; shipped in PR #${D.PR} &middot; nothing retired, disabled or reassigned`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const n = (x) => x.toLocaleString('en-US');

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .card .n { font-size: 16pt; }
  .kpi .card { text-align: center; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  .kpi .card.bad .n { color: ${SEV.bad}; }
  h2 { font-size: 9.5pt; margin: 5px 0 3px; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  table { font-size: 7.6pt; margin: 3px 0 5px; }
  th, td { padding: 2px 5px; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.block { border-top-color: ${SEV.bad}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.7pt; line-height: 1.35; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  /* Three columns of short rows rather than one 13-row table: the names are long and the counts
     are the point, so a wide table would waste most of its width on whitespace. */
  .live { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 14px; }
  .lr {
    display: flex; align-items: center; gap: 5px; font-size: 7.8pt;
    border-bottom: 1px solid ${TOKENS.BORDER}; padding: 1.5px 0;
  }
  .lr .dot { width: 7px; height: 7px; border-radius: 2px; flex: none; }
  .lr .ln { flex: 1; font-family: Consolas, monospace; font-size: 7.4pt; }
  .lr .lv { font-variant-numeric: tabular-nums; font-weight: 700; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${D.CLASSIFIED} / ${D.CLASSIFIED}</div>
      <div class="k">Legacy names accounted for</div></div>
    <div class="card"><div class="n">${D.DOMAINED}</div><div class="k">Mapped onto the ten</div></div>
    <div class="card bad"><div class="n">${D.TOTAL_ENABLED}, not 5</div>
      <div class="k">Undomained rows that are LIVE</div></div>
    <div class="card bad"><div class="n">${n(D.TOTAL_RUNS)}</div>
      <div class="k">Runs behind the decision</div></div>
  </div>`;

  const map = barChart({
    rows: D.DOMAIN_MAP.map(([label, value]) => ({
      label: label.replace(/ &.*/, '').replace(/,.*/, ''),
      value,
      display: String(value),
      color: value >= 38 ? TOKENS.CHERRY : TOKENS.LEAF,
    })),
    width: 500,
    labelW: 118,
    barH: 13,
    gap: 4,
  });

  const kindRows = D.KINDS.map((k) => `
    <tr>
      <td>${esc(k.kind)}</td>
      <td class="num">${k.rows}</td>
      <td class="num"><strong style="color:${k.enabled ? SEV.bad : SEV.ok}">${k.enabled}</strong></td>
      <td class="num">${n(k.runs)}</td>
    </tr>`).join('');

  const body = `
  <h1>Every legacy agent is accounted for. Thirteen are live, not five.</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">The takeaway</div>
    <div class="headline">The record said five undomained agents were live. Thirteen are, and
    they have run ${n(D.TOTAL_RUNS)} times.</div>
    <div>"Five" was the count of rows whose PROPOSED KIND is unresolved, and it was being read as
    the count of live ones. <strong>visitor_tracker alone is ${n(1300725)} runs</strong>, 87% of
    the undomained total and three orders of magnitude above the next. The decision is two and a
    half times larger than the record implied.</div>
  </div>

  ${kpi}

  <div class="cols">
    <div class="col">
      <h2>225 of ${D.CLASSIFIED} map onto the ten domains</h2>
      ${map}
      <div class="tiny">Executive inherits a third of the estate. Internship inherits exactly
      one, so that domain is almost entirely new build rather than consolidation.</div>
    </div>
    <div class="col">
      <h2>The 21 that resist a domain</h2>
      <table>
        <thead><tr><th>Proposed kind</th><th class="num">Rows</th><th class="num">Enabled</th>
          <th class="num">Runs</th></tr></thead>
        <tbody>${kindRows}
          <tr><td><strong>total</strong></td><td class="num"><strong>${D.TOTAL_ROWS}</strong></td>
            <td class="num"><strong>${D.TOTAL_ENABLED}</strong></td>
            <td class="num"><strong>${n(D.TOTAL_RUNS)}</strong></td></tr>
        </tbody>
      </table>
      <div class="panel" style="margin-top:4px">
        <div class="hd">The cheapest third of the decision</div>
        <div class="bd">${esc(D.DECISION.cheapestThird)}</div>
      </div>
    </div>
    <div class="col panel block">
      <div class="hd" style="color:${SEV.bad}">This ticket does not close yet</div>
      <div class="bd"><strong>Criterion 5 is BLOCKED - ALI DECISION REQUIRED</strong>, and that is
      the correct end state rather than a gap. The decision itself is ${esc(D.DECISION.owner)}.</div>
      <div class="hd" style="margin-top:6px">Why they resist a domain</div>
      <div class="bd">${esc(D.DECISION.whyTheyResist)}</div>
      <div class="hd" style="margin-top:6px">${D.CLASSIFIED} + ${D.RECONCILIATION.createdAfterCut}
        = ${D.RECONCILIATION.liveRegistry}</div>
      <div class="bd">${esc(D.RECONCILIATION.retired)}</div>
    </div>
  </div>
  <h2 style="margin-top:9px">The thirteen that are actually running, by name</h2>
  <div class="live">${D.LIVE_ROWS.map(([name, runs, kind]) => `
    <div class="lr">
      <span class="dot" style="background:${kind === 'behavior' ? SEV.watch : SEV.bad}"></span>
      <span class="ln">${esc(name)}</span>
      <span class="lv">${n(runs)}</span>
    </div>`).join('')}</div>
  <div class="tiny" style="margin-top:3px">Orange is a proposed behavior, red is still
  unresolved. The eight proposed for retirement are not here: all eight are disabled with zero
  runs. Full run counts, the two-direction reconciliation and the acceptance criteria are in the
  spec document beside this page.</div>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.4pt; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  ul { margin: 4px 0 0 18px; padding: 0; }
  li { margin: 3px 0; }
  `;

  const liveRows = D.LIVE_ROWS.map(([name, runs, kind]) => `
    <tr><td class="p">${esc(name)}</td><td class="num">${n(runs)}</td>
    <td><span class="chip" style="background:${kind === 'behavior' ? SEV.watch : SEV.bad}">${esc(kind)}</span></td></tr>`).join('');

  const mapRows = D.DOMAIN_MAP.map(([label, value]) => `
    <tr><td>${esc(label)}</td><td class="num">${value}</td></tr>`).join('');

  const criteriaRows = D.CRITERIA.map((c) => `
    <tr>
      <td style="width:18px">${c.n}</td>
      <td>${esc(c.text)}<div class="meta">${esc(c.evidence)}</div></td>
      <td style="width:74px"><span class="chip"
        style="background:${c.met ? SEV.ok : SEV.bad}">${c.met ? 'MET' : 'BLOCKED'}</span></td>
    </tr>`).join('');

  const verifyRows = D.VERIFICATION.map(([g, r]) => `
    <tr><td>${esc(g)}</td><td>${esc(r)}</td></tr>`).join('');

  const runsChart = barChart({
    rows: D.LIVE_ROWS.slice(0, 8).map(([name, runs]) => ({
      label: name, value: runs, display: n(runs), color: runs > 100000 ? SEV.bad : TOKENS.CHERRY,
    })),
    width: 620,
    labelW: 190,
    barH: 15,
    gap: 5,
  });

  const body = `
  <h1>${D.TICKET}: the consolidation map, and which legacy agents are still running</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">Four of the five acceptance criteria are met. The fifth is BLOCKED -
    ALI DECISION REQUIRED, which is the end state the ticket asks for.</div>
    <div>Every one of the ${D.CLASSIFIED} classified legacy names is accounted for, ${D.DOMAINED}
    of them mapped onto the ten domains and ${D.UNDOMAINED} bucketed with a measured reason. The
    count gap is reconciled in both directions. And the ticket's own premise is corrected: there
    are ${D.TOTAL_ENABLED} live undomained rows, not five.
    <strong>This ticket should not be closed until the AF6.1 decision is made.</strong></div>
  </div>

  <h2>The correction: thirteen are live, not five</h2>
  <p><code>_unresolved.json</code>'s comment said "Five of these are live production rows". Five is
  the count of rows whose <em>proposed kind</em> is <code>unresolved</code>; it was being read as
  the count of live rows. Measured against production on ${esc(D.MEASURED_ON)}:</p>
  <table>
    <thead><tr><th>Proposed kind</th><th class="num">Rows</th><th class="num">Enabled</th>
      <th class="num">Runs between the enabled ones</th></tr></thead>
    <tbody>
      ${D.KINDS.map((k) => `<tr><td>${esc(k.kind)}</td><td class="num">${k.rows}</td>
        <td class="num">${k.enabled}</td><td class="num">${n(k.runs)}</td></tr>`).join('')}
      <tr><td><strong>total</strong></td><td class="num"><strong>${D.TOTAL_ROWS}</strong></td>
        <td class="num"><strong>${D.TOTAL_ENABLED}</strong></td>
        <td class="num"><strong>${n(D.TOTAL_RUNS)}</strong></td></tr>
    </tbody>
  </table>

  <h2>The thirteen live rows, by name</h2>
  <figure>${runsChart}
    <figcaption class="meta">The eight largest. visitor_tracker alone is ${n(1300725)} runs, 87%
    of the undomained total and three orders of magnitude above the next one.</figcaption>
  </figure>
  <table>
    <thead><tr><th>Agent</th><th class="num">Runs</th><th>Proposed kind</th></tr></thead>
    <tbody>${liveRows}</tbody>
  </table>

  <h2>The eight proposed for retirement</h2>
  <p>${esc(D.DECISION.cheapestThird)}</p>
  <p class="p">${D.RETIRE_ROWS.map((r) => esc(r)).join(', ')}</p>
  <p>${esc(D.DECISION.hardestPart)}</p>

  <h2>The map: ${D.DOMAINED} of ${D.CLASSIFIED} onto the ten domains</h2>
  <table>
    <thead><tr><th>Target domain</th><th class="num">Legacy rows inherited</th></tr></thead>
    <tbody>${mapRows}
      <tr><td><strong>domained</strong></td><td class="num"><strong>${D.DOMAINED}</strong></td></tr>
      <tr><td><em>undomained</em></td><td class="num"><em>${D.UNDOMAINED}</em></td></tr>
    </tbody>
  </table>
  <p>Executive inherits a third of the estate, so whoever owns it inherits the largest capability
  surface by a wide margin. Internship inherits exactly one, so that domain is almost entirely new
  build rather than consolidation.</p>

  <h2>The count reconciliation, both directions</h2>
  <p><strong>${D.CLASSIFIED} classified + ${D.RECONCILIATION.createdAfterCut} created after the
  classification was cut = ${D.RECONCILIATION.liveRegistry} ai_agents rows in production.</strong></p>
  <p>${esc(D.RECONCILIATION.bothDirections)} Checking one direction only would have been a
  coincidence rather than a reconciliation.</p>
  <ul>${D.RECONCILIATION.theTwentyThree.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  <p>${esc(D.RECONCILIATION.retired)}</p>

  <h2>Why these 21 resist a domain</h2>
  <p>${esc(D.DECISION.whyTheyResist)}</p>

  <h2>The five acceptance criteria</h2>
  <table>
    <thead><tr><th></th><th>Criterion and evidence</th><th></th></tr></thead>
    <tbody>${criteriaRows}</tbody>
  </table>

  <h2>Verification</h2>
  <table>
    <thead><tr><th>Gate</th><th>Result</th></tr></thead>
    <tbody>${verifyRows}</tbody>
  </table>
  <p>Nothing is retired, disabled or reassigned by this work. It records and measures;
  <code>needs_owner_decision</code> stays <code>true</code> and every disposition stays
  <code>unresolved</code>, both pinned by tests.</p>`;

  return shell({ title: `${D.TICKET} specification`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
