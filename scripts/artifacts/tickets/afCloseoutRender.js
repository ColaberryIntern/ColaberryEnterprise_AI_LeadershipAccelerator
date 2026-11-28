/**
 * The one-page visual and the completion document for each of the five Agent Factory tickets
 * closed on 2026-11-27.
 *
 * Both read `afCloseoutData.js`, so the figure on the picture and the figure in the prose are the
 * same figure by construction.
 *
 * ## Why every visual carries the same pipeline strip
 *
 * Each of these five tickets is individually finished. Read together they would say the
 * tool-request pipeline works, and it does not: 391 capabilities described, 0 confirmed, 5
 * requests filed, 0 decided. So the strip showing those counts is on EVERY visual, under the
 * ticket's own good news. A reader who takes one PDF out of the set still sees the state of the
 * thing it is part of, which is what makes the set honest rather than five green lights.
 */
const D = require('./afCloseoutData');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const TONE = { ok: SEV.ok, good: SEV.ok, watch: SEV.watch, warn: SEV.watch, bad: SEV.bad };

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const foot = (t) => `${t.code} &middot; Agent Factory &middot; shipped ${esc(t.merged)}`
  + `${t.pr ? ` in PR #${t.pr}` : ''} (${esc(t.sha)}) &middot; production measured ${esc(D.MEASURED_ON)}`;

/** The six counts that say where the pipeline actually is. */
const pipelineHtml = () => `<div class="pipe">${D.PIPELINE.map(([label, n, tone]) => `
  <div class="cell" style="border-bottom-color:${TONE[tone]}">
    <div class="n" style="color:${TONE[tone]}">${n}</div><div class="l">${esc(label)}</div></div>`).join('')}</div>`;

const ladderHtml = (t) => `<div class="ladder">${t.ladder.map(([stage, ok, note]) => `
  <div class="step" style="background:${ok ? SEV.ok : SEV.watch}">
    <div class="s">${esc(stage)} ${ok ? '&#10003;' : '&#9888;'}</div>
    <div class="d">${esc(note)}</div></div>`).join('')}</div>`;

const kpiHtml = (t) => `<div class="cards kpi">${t.kpi.map(([n, k, tone]) => `
  <div class="card"><div class="n" style="color:${TONE[tone]}">${esc(n)}</div>
  <div class="k">${esc(k)}</div></div>`).join('')}</div>`;

/**
 * The five real requests, on the picture rather than only in the document.
 *
 * Without this the visual says "0 decisions" and the reader has to take the zero on trust. With
 * it the zero has names and dates attached, and one of them is already past its needed-by date,
 * which is the fact most likely to change what Ali does next.
 */
const requestsHtml = () => `<table class="reqs"><tbody>${D.REQUESTS.map(
  ([dom, tool, filed, need, late]) => `<tr>
    <td class="d">${esc(dom)}</td>
    <td class="t">${esc(tool)}</td>
    <td class="f">filed ${esc(filed)}</td>
    <td class="n${late ? ' late' : ''}">needed ${esc(need)}${late ? ' &middot; OVERDUE' : ''}</td>
  </tr>`,
).join('')}</tbody></table>`;

const VISUAL_CSS = `
  body { font-size: 9.1pt; }
  h1 { font-size: 15pt; }
  h2 { font-size: 9.5pt; margin: 7px 0 3px; }
  .rule { margin: 6px 0 8px; }
  .takeaway { padding: 7px 11px; margin-bottom: 8px; }
  .takeaway .headline { font-size: 11pt; }
  .cards { margin: 6px 0 8px; }
  .kpi .card { text-align: center; }
  .kpi .card .n { font-size: 16pt; }
  .ladder { display: flex; gap: 5px; margin: 4px 0 8px; }
  .step { flex: 1; border-radius: 4px; padding: 4px 6px; color: #fff; }
  .step .s { font-size: 8.2pt; font-weight: 700; }
  .step .d { font-size: 6.8pt; opacity: .95; line-height: 1.25; }
  .pipe { display: flex; gap: 4px; margin: 4px 0 8px; }
  .pipe .cell { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-bottom-width: 3px;
    border-radius: 4px; padding: 4px 6px; background: #fff; text-align: center; }
  .pipe .cell .n { font-size: 13pt; font-weight: 700; line-height: 1.1; }
  .pipe .cell .l { font-size: 6.6pt; color: ${TOKENS.MUTED}; line-height: 1.2; }
  .cols { display: flex; gap: 10px; align-items: flex-start; }
  .col { flex: 1; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${SEV.watch};
    border-radius: 5px; padding: 6px 9px; background: #fff; }
  .panel.ship { border-top-color: ${TOKENS.LEAF}; }
  .panel .hd { font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px; }
  .panel .bd { font-size: 7.4pt; line-height: 1.34; }
  ul { margin: 0; padding-left: 13px; }
  li { margin-bottom: 2px; }
  .tiny { font-size: 7.1pt; color: ${TOKENS.MUTED}; margin-top: 3px; }
  .reqs { width: 100%; border-collapse: collapse; margin: 3px 0 0; }
  .reqs td { font-size: 7.3pt; padding: 2px 6px; border-bottom: 1px solid ${TOKENS.BORDER}; }
  .reqs td.d { font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; width: 88px; }
  .reqs td.t { font-family: Consolas, monospace; }
  .reqs td.f { color: ${TOKENS.MUTED}; width: 78px; }
  .reqs td.n { width: 128px; text-align: right; color: ${TOKENS.MUTED}; }
  .reqs td.n.late { color: ${SEV.bad}; font-weight: 700; }
`;

function buildVisual(key) {
  const t = D.TICKETS[key];
  const body = `
  <h1>${esc(t.headline)}</h1>
  <div class="meta">${foot(t)}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(t.delivered)}</div>
    <div>${esc(t.asked)}</div>
  </div>
  ${kpiHtml(t)}
  <h2>The shipping ladder, not collapsed into "done"</h2>
  ${ladderHtml(t)}
  <h2>Where the pipeline this belongs to actually stands, measured ${esc(D.MEASURED_ON)}</h2>
  ${pipelineHtml()}
  <div class="cols">
    <div class="col">
      <div class="panel ship">
        <div class="hd">What shipped</div>
        <div class="bd"><ul>${t.shipped.slice(0, 4).map(([f, w]) => `<li><strong>${esc(f)}</strong> ${esc(w)}</li>`).join('')}</ul></div>
      </div>
    </div>
    <div class="col">
      <div class="panel">
        <div class="hd">What this does NOT establish</div>
        <div class="bd"><ul>${t.notEstablished.slice(0, 2).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      </div>
    </div>
  </div>
  <h2>The five requests this machinery was built for, none of them decided</h2>
  ${requestsHtml()}
  <div class="tiny">Closing this ticket records that the code is finished. It does not record that the
  pipeline works. The next move is not a build: AF6.3 decides how a capability leaves draft, and
  until it is decided every one of the requests above stays refused as capability_not_confirmed.</div>`;
  return shell({ title: `${t.code} one-page visual`, body, extraCss: VISUAL_CSS });
}

const DOC_CSS = `
  h2 { margin-top: 17px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  .req td { font-size: 8.4pt; }
  .late { color: ${SEV.bad}; font-weight: 700; }
`;

const chip = (ok, y = 'YES', n = 'NO') =>
  `<span class="chip" style="background:${ok ? SEV.ok : SEV.watch}">${ok ? y : n}</span>`;

function buildDocument(key) {
  const t = D.TICKETS[key];
  const shippedRows = t.shipped.map(([f, w]) => `<tr><td class="p">${esc(f)}</td><td>${esc(w)}</td></tr>`).join('');
  const evidenceRows = t.evidence.map(([c, r, ok]) =>
    `<tr><td>${esc(c)}</td><td><strong>${esc(r)}</strong></td><td style="width:52px">${chip(ok, 'PASS', 'GAP')}</td></tr>`).join('');
  const ladderRows = t.ladder.map(([s, ok, d]) =>
    `<tr><td><strong>${esc(s)}</strong></td><td>${esc(d)}</td><td style="width:52px">${chip(ok)}</td></tr>`).join('');
  const pipeRows = D.PIPELINE.map(([l, n]) => `<tr><td>${esc(l)}</td><td><strong>${n}</strong></td></tr>`).join('');
  const reqRows = D.REQUESTS.map(([dom, tool, filed, need, late]) =>
    `<tr><td>${esc(dom)}</td><td class="p">${esc(tool)}</td><td>${esc(filed)}</td>`
    + `<td${late ? ' class="late"' : ''}>${esc(need)}${late ? ' (overdue)' : ''}</td></tr>`).join('');

  const body = `
  <h1>${esc(t.headline)}</h1>
  <div class="meta">${foot(t)}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(t.delivered)}</div>
    <div>${esc(t.asked)}</div>
  </div>

  <h2>Takeaway</h2>
  <p>This ticket is finished and is being closed on that basis. It is one of five closed together on
  27 Nov 2026, and the set shares a caveat that none of them states alone: every one of them built a
  working piece of the tool-request pipeline, and no real request has ever traveled it. The counts
  below are the measurement, not an impression.</p>

  <h2>What shipped</h2>
  <table><thead><tr><th>File or surface</th><th>What it does</th></tr></thead><tbody>${shippedRows}</tbody></table>

  <h2>Evidence, checked rather than recalled</h2>
  <table><thead><tr><th>Check</th><th>Result</th><th></th></tr></thead><tbody>${evidenceRows}</tbody></table>

  <h2>The shipping ladder</h2>
  <p>Built, merged, deployed and used are four different states. Collapsing them into "done" is how a
  feature nobody has run reads as a feature that works.</p>
  <table><thead><tr><th>Stage</th><th>Evidence</th><th></th></tr></thead><tbody>${ladderRows}</tbody></table>

  <h2>The pipeline these five tickets serve, measured ${esc(D.MEASURED_ON)}</h2>
  <p>Read by SELECT against <code>accelerator_prod</code>, not inferred from merge dates.</p>
  <table><thead><tr><th>Thing counted</th><th>Count</th></tr></thead><tbody>${pipeRows}</tbody></table>

  <h2>The five requests waiting on a decision</h2>
  <p>Real requests, filed by real builders, none of which has ever received a decision. This is the
  work the five closed tickets were built to make possible.</p>
  <table class="req"><thead><tr><th>Domain</th><th>Tool</th><th>Filed</th><th>Needed by</th></tr></thead>
  <tbody>${reqRows}</tbody></table>

  <h2>What this does not establish</h2>
  <ul>${t.notEstablished.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>

  <h2>The next decision, and it is not a build</h2>
  <p>Nothing above is blocked on engineering. The chain is AF6.3 (how a capability leaves draft, and
  who may confirm it), then AF7.1 (confirm one domain, so the confirmed count stops being zero), then
  the grant. AF6.3 is a decision only Ali can make, and until it is made the confirmation route built
  in AF11.18 has nothing to confirm and every tool grant stays refused as
  <code>capability_not_confirmed</code>.</p>

  <h2>Links</h2>
  <p>Ticket: https://app.basecamp.com/3945211/buckets/${D.BUCKET}/todos/${t.id}
  ${t.pr ? `<br>PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/${t.pr}` : ''}</p>`;

  return shell({ title: `${t.code} completion document`, body, extraCss: DOC_CSS });
}

module.exports = { buildVisual, buildDocument };
