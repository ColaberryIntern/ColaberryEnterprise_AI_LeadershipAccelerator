/**
 * AF11.13's one-page visual and its completion document.
 *
 * The visual leads with the shipping ladder and the flow, because the question it answers is
 * "may this close", and the honest answer has a red rung: the code is live but no real request
 * has used it yet. That rung is drawn, not footnoted.
 */
const D = require('./af1113Data');
const { TOKENS, SEV, esc, baseCss } = require('../artifactTheme');

const FOOT = `${D.TICKET} &middot; Agent Factory &middot; merged ${D.MERGED_ON} in PR #${D.PR} `
  + `(${D.MERGE_SHA}) &middot; production measured ${D.MEASURED_ON}`;

function shell({ title, body, extraCss = '' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${baseCss()}${extraCss}</style></head><body>${body}</body></html>`;
}

const ladderHtml = () => `<div class="ladder">${D.LADDER.map(([s, ok, d]) => `
  <div class="step" style="background:${ok ? SEV.ok : SEV.watch}">
    <div class="s">${esc(s)} ${ok ? '&#10003;' : '&#9888;'}</div><div class="d">${esc(d)}</div></div>`).join('')}</div>`;

const flowHtml = () => `<div class="flow">${D.FLOW.map(([who, what], i) => `
  <div class="node${i === 2 ? ' guard' : ''}${i === 4 ? ' stop' : ''}">
    <div class="who">${i + 1}. ${esc(who)}</div><div class="what">${esc(what)}</div></div>
  ${i < D.FLOW.length - 1 ? '<div class="arrow">&#8594;</div>' : ''}`).join('')}</div>`;

const blocksHtml = () => `
  <div class="blocks">
    ${D.DRAFTED_BLOCKS.map((b) => `<span class="blk ok">${esc(b)}</span>`).join('')}
    ${D.BLOCKED_BLOCKS.map((b) => `<span class="blk no">${esc(b)}</span>`).join('')}
  </div>`;

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
  .kpi .card.good .n { color: ${SEV.ok}; }
  .kpi .card.warn .n { color: ${SEV.watch}; }
  .ladder { display: flex; gap: 5px; margin: 4px 0 8px; }
  .step { flex: 1; border-radius: 4px; padding: 4px 6px; color: #fff; }
  .step .s { font-size: 8.2pt; font-weight: 700; }
  .step .d { font-size: 6.8pt; opacity: .95; line-height: 1.25; }
  .flow { display: flex; align-items: stretch; gap: 3px; margin: 4px 0 8px; }
  .node { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${TOKENS.LEAF};
    border-radius: 4px; padding: 4px 6px; background: #fff; }
  .node.guard { border-top-color: ${TOKENS.CHERRY}; }
  .node.stop { border-top-color: ${SEV.watch}; }
  .node .who { font-size: 7.8pt; font-weight: 700; }
  .node .what { font-size: 7pt; line-height: 1.25; color: ${TOKENS.INK}; }
  .arrow { align-self: center; color: ${TOKENS.MUTED}; font-size: 11pt; }
  .cols { display: flex; gap: 12px; align-items: flex-start; }
  .col { flex: 1; }
  .blocks { display: flex; flex-wrap: wrap; gap: 3px; }
  .blk { font-size: 7pt; font-family: Consolas, monospace; border-radius: 3px; padding: 2px 5px; color: #fff; }
  .blk.ok { background: ${SEV.ok}; }
  .blk.no { background: ${SEV.bad}; text-decoration: line-through; }
  .panel { border: 1px solid ${TOKENS.BORDER}; border-top: 3px solid ${SEV.watch};
    border-radius: 5px; padding: 6px 9px; background: #fff; }
  .panel .hd { font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: ${TOKENS.CHERRY_DEEP}; margin-bottom: 4px; }
  .panel .bd { font-size: 7.6pt; line-height: 1.34; }
  ul { margin: 0; padding-left: 14px; }
  .tiny { font-size: 7.3pt; color: ${TOKENS.MUTED}; }
`;

function buildVisual() {
  const k = D.KPI;
  const body = `
  <h1>${esc(D.HEADLINE)}</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(D.DELIVERED)}</div>
    <div>${esc(D.ASKED)}</div>
  </div>
  <div class="cards kpi">
    <div class="card good"><div class="n">${k.blocksDrafted}</div><div class="k">Argument blocks the AI now drafts</div></div>
    <div class="card good"><div class="n">${k.blocksBlocked}</div><div class="k">Evidence blocks it can never write</div></div>
    <div class="card good"><div class="n">${k.packageTests}</div><div class="k">Tests pinning the package</div></div>
    <div class="card warn"><div class="n">${k.prodPackages} / ${k.prodRequests}</div><div class="k">Prod requests carrying a package</div></div>
  </div>
  <h2>The shipping ladder, not collapsed into "done"</h2>
  ${ladderHtml()}
  <h2>What happens when a builder drafts a request</h2>
  ${flowHtml()}
  <div class="cols">
    <div class="col">
      <h2>The package: what the AI writes, and what it is stopped from writing</h2>
      ${blocksHtml()}
      <div class="tiny" style="margin-top:4px">Red, struck through: the record of a run that really happened.
      A drafted one would be fabricated evidence, so the normalizer deletes it whatever the model returns.
      "Not ready: simulation missing" is the feature working.</div>
    </div>
    <div class="col">
      <div class="panel">
        <div class="hd">What this does NOT establish</div>
        <div class="bd"><ul>${D.NOT_ESTABLISHED.slice(0, 3).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      </div>
    </div>
  </div>`;
  return shell({ title: `${D.TICKET} one-page visual`, body, extraCss: VISUAL_CSS });
}

function buildDocument() {
  const css = `
  h2 { margin-top: 18px; }
  table { width: 100%; }
  td.p { font-family: Consolas, monospace; font-size: 8.2pt; }
  `;
  const chip = (ok, y = 'YES', n = 'NO') => `<span class="chip" style="background:${ok ? SEV.ok : SEV.watch}">${ok ? y : n}</span>`;
  const ladderRows = D.LADDER.map(([s, ok, d]) => `<tr><td><strong>${esc(s)}</strong></td><td>${esc(d)}</td><td style="width:52px">${chip(ok)}</td></tr>`).join('');
  const verifiedRows = D.VERIFIED.map(([c, r, ok]) => `<tr><td>${esc(c)}</td><td><strong>${esc(r)}</strong></td><td style="width:52px">${chip(ok, 'PASS', 'GAP')}</td></tr>`).join('');
  const testRows = D.TESTS.map(([t, w]) => `<tr><td class="p">${esc(t)}</td><td>${esc(w)}</td></tr>`).join('');
  const flowRows = D.FLOW.map(([who, what], i) => `<tr><td><strong>${i + 1}. ${esc(who)}</strong></td><td>${esc(what)}</td></tr>`).join('');

  const body = `
  <h1>${esc(D.HEADLINE)}</h1>
  <div class="meta">${FOOT}</div>
  <div class="rule"></div>
  <div class="takeaway">
    <div class="label">Asked and delivered</div>
    <div class="headline">${esc(D.DELIVERED)}</div>
    <div>${esc(D.ASKED)}</div>
  </div>

  <h2>Takeaway</h2>
  <p>The machinery to judge a request (the package table, its gate, the readiness check) already
  existed. What was missing was anything that wrote a package. The drafter from AF11.12 now writes
  one alongside the request, so a request can reach Ali carrying its own argument. It is merged and
  live. It has not yet been used: the four requests in production were filed by hand.</p>

  <h2>A correction made before building</h2>
  <p>${esc(D.CORRECTION)}</p>

  <h2>The flow</h2>
  <table><thead><tr><th>Step</th><th>What happens</th></tr></thead><tbody>${flowRows}</tbody></table>

  <h2>Why the package travels inside the filing call</h2>
  <p>${esc(D.WHY_NOT_PUT)}</p>

  <h2>The one block the drafter must not write</h2>
  <p><code>simulated_action</code>, <code>simulated_against</code> and <code>simulated_at</code> record a run
  against real past data. A model asked to fill them would invent one, and an invented simulation is
  fabricated evidence in the block whose whole job is to be evidence. The prompt tells the model not to
  write them, and the normalizer deletes them whatever comes back: a prompt is a request, a normalizer is a
  guarantee. The package is then correctly not ready for a human, and the readiness gate says so by name.</p>

  <h2>Tests that pin it</h2>
  <p>From <code>backend/src/services/agentDomain/__tests__/toolRequestDrafter.test.ts</code>, block
  "AF11.13 the decision package". At merge the full backend suite ran 47,277 passing; both typechecks
  were clean and proven able to fail with a planted error.</p>
  <table><thead><tr><th>Test</th><th>What it pins</th></tr></thead><tbody>${testRows}</tbody></table>

  <h2>Measured in production, ${esc(D.MEASURED_ON)}</h2>
  <p>Read inside the running <code>accelerator-backend</code> and <code>accelerator-db</code> containers, not
  inferred from the merge date.</p>
  <table><thead><tr><th>Check</th><th>Result</th><th></th></tr></thead><tbody>${verifiedRows}</tbody></table>
  <p>${esc(D.PROD_GAP)}</p>

  <h2>The shipping ladder</h2>
  <table><thead><tr><th>Stage</th><th>Evidence</th><th></th></tr></thead><tbody>${ladderRows}</tbody></table>

  <h2>What this does not establish</h2>
  <ul>${D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>

  <h2>Links</h2>
  <p>PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/${D.PR}<br>
  Ticket: https://app.basecamp.com/3945211/buckets/7463955/todos/${D.TICKET_ID}</p>`;
  return shell({ title: `${D.TICKET} completion document`, body, extraCss: css });
}

module.exports = { buildVisual, buildDocument };
