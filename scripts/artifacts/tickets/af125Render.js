/**
 * AF12.5's one-page visual and its completion document.
 *
 * The visual leads with the shipping ladder, because the decision this artifact supports is
 * "may this ticket close", and that question is answered by how far along the ladder the work
 * actually got rather than by how much of it was built. The second thing it leads with is what
 * the ticket does NOT establish, so a reader cannot mistake "records reachable" for "the
 * builders' pages are done".
 */
const D = require('./af125Data');
const { TOKENS, SEV, esc, baseCss, barChart } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + `(${D.MERGE_SHA}) &middot; verified in production`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

/**
 * Every bar is the same color on purpose.
 *
 * The first draft painted marketing and product_experience cherry to mark the two domains whose
 * builders reported this. Looking at the render, they read as FAILING: red on a chart is a status,
 * and a reader takes the color before they reach the caption explaining it. The two domains are
 * now marked in the label instead, where the meaning cannot be misread as severity.
 */
const REPORTED = new Set(['marketing', 'product_experience']);

const domainChart = (width, labelW, barH, gap) => barChart({
  rows: D.DOMAINS.map(([name, caps]) => ({
    label: REPORTED.has(name) ? `${name} *` : name,
    value: caps,
    display: String(caps),
    color: TOKENS.LEAF,
  })),
  width,
  labelW,
  barH,
  gap,
  max: 89,
});

/**
 * The production checks, two to a row, so the evidence strip fits the width it has rather than
 * running as a single tall column that pushes the page over.
 */
function evidencePairs(limit = D.VERIFIED.length) {
  const src = D.VERIFIED.slice(0, limit);
  const rows = [];
  for (let i = 0; i < src.length; i += 2) {
    const [ka, va] = src[i];
    const pair = src[i + 1];
    rows.push(`<tr>
      <td>${esc(ka)}</td><td><strong style="color:${SEV.ok}">${esc(va)}</strong></td>
      <td>${pair ? esc(pair[0]) : ''}</td>
      <td>${pair ? `<strong style="color:${SEV.ok}">${esc(pair[1])}</strong>` : ''}</td>
    </tr>`);
  }
  return rows.join('');
}

/* ------------------------------------------------------------------ visual */

function buildVisual() {
  const css = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  h2 { font-size: 9.5pt; margin: 6px 0 3px; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .kpi .card { text-align: center; }
  .kpi .card .n { font-size: 16pt; }
  .kpi .card.good .n { color: ${SEV.ok}; }
  .cards { margin: 6px 0 8px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .tiny { font-size: 7.5pt; color: ${TOKENS.MUTED}; }
  .panel {
    border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 5px; padding: 6px 9px; background: #fff;
  }
  .panel.warn { border-top-color: ${SEV.watch}; }
  .panel .hd {
    font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px;
  }
  .panel .bd { font-size: 7.6pt; line-height: 1.34; }
  .panel .bd li { margin-bottom: 2px; }
  ul { margin: 0; padding-left: 14px; }
  .ladder { display: flex; gap: 5px; margin: 5px 0 8px; }
  .step {
    flex: 1; border-radius: 4px; padding: 4px 6px; color: #fff; background: ${SEV.ok};
  }
  .step .s { font-size: 8.2pt; font-weight: 700; }
  .step .d { font-size: 6.8pt; opacity: .92; line-height: 1.25; }
  table { font-size: 7.6pt; margin: 3px 0 4px; }
  th, td { padding: 2px 5px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  `;

  const kpi = `
  <div class="cards kpi">
    <div class="card good"><div class="n">${D.KPI.capabilities}</div>
      <div class="k">Capability records now reachable</div></div>
    <div class="card good"><div class="n">${D.KPI.rungs}</div>
      <div class="k">Per-rung entries, panel 4's only source</div></div>
    <div class="card good"><div class="n">${D.KPI.leaked}</div>
      <div class="k">Keys published outside the allow-list</div></div>
    <div class="card good"><div class="n">${D.KPI.mutationsCaught} / ${D.KPI.mutationsRun}</div>
      <div class="k">Mutations caught by the tests</div></div>
  </div>`;

  const ladder = `<div class="ladder">${D.LADDER.map(([s, , d]) => `
    <div class="step"><div class="s">${esc(s)}</div><div class="d">${esc(d)}</div></div>`).join('')}</div>`;

  const reporters = D.REPORTERS.map(([who, when, what]) => `
    <tr><td><strong>${esc(who)}</strong></td><td class="num">${esc(when)}</td>
    <td>${esc(what)}</td></tr>`).join('');

  const body = `
  <h1>${esc(D.HEADLINE)}</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(D.DELIVERED)}</div>
    <div>${esc(D.ASKED)}</div>
  </div>

  ${kpi}

  <h2>The shipping ladder, not collapsed into "done"</h2>
  ${ladder}

  <div class="cols">
    <div class="col">
      <h2>Capability records now reachable, by domain</h2>
      ${domainChart(430, 110, 13, 4)}
      <div class="tiny">* marks the two domains whose builders reported this.
      974 per-rung entries sit under these 448 records.</div>
    </div>
    <div class="col">
      <h2>Reported independently, three times</h2>
      <table><tbody>${reporters}</tbody></table>
      <div class="panel warn" style="margin-top:6px">
        <div class="hd">What this does NOT establish</div>
        <div class="bd"><ul>
          <li>No frontend. Their Command Centers live in their own repositories, so this makes
          their criteria satisfiable, not satisfied.</li>
          <li>A builder sees the snapshot fields on their next document sync, not at deploy.</li>
          <li>The recorded dataset scope is still not enforced at runtime by anything.</li>
        </ul></div>
      </div>
    </div>
  </div>

  <h2>Measured inside the running production container, not inferred from the image tag
  <span class="tiny" style="font-weight:400; text-transform:none">
  &mdash; 8 of ${D.VERIFIED.length} shown, the document carries the rest</span></h2>
  <table>
    <thead><tr><th>Check</th><th>Result</th><th>Check</th><th>Result</th></tr></thead>
    <tbody>${evidencePairs(8)}</tbody>
  </table>`;

  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: css });
}

/* ---------------------------------------------------------------- document */

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  `;

  const verifiedRows = D.VERIFIED.map(([k, v, ok]) => `
    <tr><td>${esc(k)}</td><td><strong>${esc(v)}</strong></td>
    <td style="width:52px"><span class="chip" style="background:${ok ? SEV.ok : SEV.bad}">${ok ? 'PASS' : 'FAIL'}</span></td></tr>`).join('');

  const ladderRows = D.LADDER.map(([s, ok, d]) => `
    <tr><td><strong>${esc(s)}</strong></td><td>${esc(d)}</td>
    <td style="width:52px"><span class="chip" style="background:${ok ? SEV.ok : SEV.bad}">${ok ? 'YES' : 'NO'}</span></td></tr>`).join('');

  const breakRows = D.BREAKS.map(([t, r]) => `
    <tr><td>${esc(t)}</td><td class="num">${esc(r)}</td></tr>`).join('');

  const decisions = D.DECISIONS.map((d) => `
    <h3>${esc(d.title)}</h3><p>${esc(d.body)}</p>`).join('');

  const reporters = D.REPORTERS.map(([who, when, what]) => `
    <tr><td><strong>${esc(who)}</strong></td><td class="num">${esc(when)}</td>
    <td>${esc(what)}</td></tr>`).join('');

  const body = `
  <h1>${D.TICKET}: publish the capability records both endpoints already loaded</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(D.DELIVERED)}</div>
    <div>${esc(D.ASKED)}</div>
  </div>

  <h2>Who reported it</h2>
  <table><thead><tr><th>Builder</th><th class="num">When</th><th>What they hit</th></tr></thead>
  <tbody>${reporters}</tbody></table>

  <h2>The defect</h2>
  <p>${esc(D.DEFECT.one)}</p>
  <p>${esc(D.DEFECT.two)}</p>
  <p>${esc(D.DEFECT.three)}</p>
  <p><strong>${esc(D.DEFECT.hole)}</strong></p>

  <h2>Capability records now reachable, by domain</h2>
  <figure>${domainChart(620, 120, 15, 5)}
    <figcaption class="meta">448 records carrying 974 per-rung entries. Every claim in the
    original ticket was re-verified against origin/main before any code was written; the line
    numbers had moved since 10 November, the facts had not.</figcaption>
  </figure>

  <h2>The design decisions worth arguing with</h2>
  ${decisions}

  <h2>BREAK list</h2>
  <p>A check that passes with the code broken proves nothing, so each guarantee was mutated and
  the suite re-run. ${D.KPI.mutationsCaught} of ${D.KPI.mutationsRun} caught; three of them
  failed exactly the one test written for them, which is the precision worth having.</p>
  <table><thead><tr><th>Tried to break it by</th><th class="num">What happened</th></tr></thead>
  <tbody>${breakRows}</tbody></table>

  <h2>Verified in production, by measurement inside the container</h2>
  <p>Not inferred from the image tag. The compiled projection was run against the real committed
  capability files inside the running backend, and the snapshot was rebuilt there.</p>
  <table><thead><tr><th>Check</th><th>Result</th><th></th></tr></thead>
  <tbody>${verifiedRows}</tbody></table>

  <h2>The shipping ladder</h2>
  <table><thead><tr><th>Stage</th><th>Evidence</th><th></th></tr></thead>
  <tbody>${ladderRows}</tbody></table>

  <h2>A flake found, and not fixed here</h2>
  <p>${esc(D.FLAKE)}</p>

  <h2>What this does not establish</h2>
  <ul>${D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;

  return shell({ title: `${D.TICKET} completion document`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
