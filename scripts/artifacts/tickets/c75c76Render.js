/**
 * C7.5 and C7.6 - four PDFs from one source.
 *
 * They are separate tickets with separate artifacts, so each gets its own one-pager and
 * document. They share a data module because the runbook and the measurement spec describe
 * the same ninety days from two sides, and letting them drift would put a gate in one that
 * the other does not measure.
 */
const D = require('./c75c76Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .p { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
       font-weight:700; color:#fff; white-space:nowrap; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .card { border:1px solid var(--border); border-left:4px solid var(--muted);
          border-radius:5px; padding:9px 11px; margin:0 0 8px; page-break-inside:avoid; }
  .card.no { border-left-color:#b3261e; }
  .card.partial { border-left-color:#b26a00; }
  .card.yes { border-left-color:#2f7d32; }
  .card h3 { margin:0 0 3px; font-size:10.2pt; }
  .card .lab { font-size:7.2pt; font-weight:700; text-transform:uppercase;
               letter-spacing:.05em; color:var(--muted); margin-top:5px; }
`;

const chip = (s) => `<span class="p" style="background:${s.color}">${esc(s.k)}</span>`;
const cls = (p) => (p === D.PROVEN.NO ? 'no' : p === D.PROVEN.PARTIAL ? 'partial' : 'yes');

function phaseTable(short) {
  return `<table>
    <tr><th style="width:13%">Days</th><th style="width:16%">Phase</th>
      <th style="width:14%">Owner</th><th style="width:14%">State</th><th>Gate</th></tr>
    ${D.PHASES.map((p) => `<tr><td>${esc(p.days)}</td><td><b>${esc(p.name)}</b></td>
      <td>${esc(p.owner)}</td><td>${chip(p.proven)}</td>
      <td>${esc(short ? `${p.gate.split('. ')[0]}.` : p.gate)}</td></tr>`).join('')}
  </table>`;
}

function measureTable(short) {
  return `<table>
    <tr><th style="width:26%">What</th><th style="width:13%">Attribution</th>
      <th>${short ? 'Why that strength' : 'Baseline and method'}</th></tr>
    ${D.MEASURES.map((m) => `<tr><td><b>${esc(m.what)}</b></td>
      <td>${chip(m.attribution)}</td>
      <td>${esc(short ? `${m.why.split('. ')[0]}.` : `${m.baseline} ${m.method}`)}</td></tr>`).join('')}
  </table>`;
}

/**
 * `short` drops the response and keeps the threshold, because the threshold is the part
 * Ali has to set and the response is the part the delivery lead follows. Both together run
 * to 233px, which does not fit beside the phase table on a landscape page.
 */
function failureTable(short) {
  return `<table>
    <tr><th style="width:24%">When this happens</th>
      <th>${short ? 'Escalation threshold, yours to set' : 'What to do, and the threshold'}</th></tr>
    ${D.FAILURE_PATHS.map((f) => `<tr><td><b>${esc(f.situation)}</b></td>
      <td>${short ? esc(f.threshold)
    : `${esc(f.response)}<br><i>${esc(f.threshold)}</i>`}</td></tr>`).join('')}
  </table>`;
}

function measuredTable() {
  return `<table>
    <tr><th style="width:28%">Measured in production</th><th style="width:30%">Value</th>
      <th>What it establishes</th></tr>
    ${D.MEASURED.map((m) => `<tr><td><b>${esc(m[0])}</b></td><td>${esc(m[1])}</td>
      <td>${esc(m[2])}</td></tr>`).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One-pagers
 * ------------------------------------------------------------------ */

const ONE_PAGE_CSS = `${baseCss()}
  ${SHARED}
  body { font-size:8.6pt; }
  h1 { font-size:15pt; }
  h2 { font-size:9.8pt; margin:7px 0 4px; }
  .takeaway { padding:8px 11px; margin:0 0 7px; }
  .takeaway .headline { font-size:9.6pt; }
  table { font-size:7.5pt; margin:2px 0 5px; }
  td, th { padding:3px 5px; }
  .note { padding:6px 9px; margin:5px 0; font-size:7.9pt; }
  .dec { padding:7px 10px; }`;

function buildVisual(which) {
  const isRunbook = which === 'c75';
  const body = `<div>
    <h1>${isRunbook ? 'C7.5 &middot; Pilot Operating Playbook'
    : 'C7.6 &middot; Pilot Measurement and Baseline Framework'}</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; ${isRunbook
    ? 'day 0 to day 90, with owners, gates and failure paths'
    : 'what we measure, against what baseline, and how strongly we can attribute it'}
      &middot; every figure measured against production</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    ${isRunbook ? `
      <h2>The ninety days</h2>
      ${phaseTable(true)}
      <div class="note warn"><b>The two unproven phases are the last two.</b> Demo Day has
        never been run end to end, and the executive report has no generator at all. They
        sit exactly where a sponsor decides whether to renew. Everything before day 75 runs
        on machinery carrying real volume.</div>
      <h2>When it goes wrong</h2>
      ${failureTable(true)}`
    : `
      <h2>What gets measured, and how strongly we can attribute it</h2>
      ${measureTable(true)}
      <div class="note warn"><b>The most important line in the spec is an admission.</b>
        Of 2,339 verification records in production, 1,624 are partial and 715 are not
        verified. None is fully verified. Any framework resting on "the platform verifies
        the work" without saying that would claim a strength we do not have.</div>
      <div class="note"><b>Business outcome is deliberately not measured.</b> C7.6 says not
        to measure what we cannot attribute, and a twelve-week pilot inside a large
        organization cannot be isolated from everything else that moved.</div>`}

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(isRunbook ? D.DECISIONS[0] : D.DECISIONS[1])}
    </div>
  </div>`;

  return htmlDoc({
    title: isRunbook ? 'C7.5 - Pilot Operating Playbook'
      : 'C7.6 - Pilot Measurement and Baseline Framework',
    css: ONE_PAGE_CSS,
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

function buildDocument(which) {
  const isRunbook = which === 'c75';
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:920px; margin:0 auto; padding:28px 22px 56px; }`;

  const asked = isRunbook
    ? '<b>What the ticket asked for.</b> The day 0 to day 90 runbook so delivery does not '
      + 'depend on memory. Every phase with an owner and a gate, the failure paths written '
      + 'and not just the happy path, and unproven steps flagged as unproven. The named '
      + 'risk is writing an idealized plan.'
    : '<b>What the ticket asked for.</b> Define what gets measured, how, and against what '
      + 'baseline, before the pilot starts. Do not measure what cannot be attributed, and '
      + 'where attribution is weak say so in the spec rather than at publication.';

  const delivered = isRunbook
    ? `<b>What was delivered.</b> ${D.PHASES.length} phases, each with an owner, a gate and `
      + `the platform capability that delivers it, ${D.FAILURE_PATHS.length} failure paths `
      + `each with a proposed escalation threshold, and ${D.counts().unproven} phases `
      + 'flagged unproven rather than estimated.'
    : `<b>What was delivered.</b> ${D.MEASURES.length} candidate measures with baseline, `
      + 'method, cadence and an explicit attribution strength, one of which is a deliberate '
      + 'refusal to measure, and a publication rule that makes the caveat travel with the '
      + 'number.';

  const body = `<div class="wrap">
    <h1>${isRunbook ? 'C7.5 &middot; Pilot Operating Playbook'
    : 'C7.6 &middot; Pilot Measurement and Baseline Framework'}</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; ${isRunbook ? 'Ticket C7.5' : 'Ticket C7.6'}
      &middot; artifact location: 07 - Pilots, Pricing &amp; ROI</div>
    <div class="rule"></div>

    <div class="asked">${asked}<br><br>${delivered}</div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>What is actually running, measured in production</h2>
    ${measuredTable()}

    ${isRunbook ? `
      <h2>The ninety days</h2>
      ${phaseTable(false)}

      <div class="pagebreak"></div>
      <h2>Each phase in full</h2>
      ${D.PHASES.map((p) => `<div class="card ${cls(p.proven)}">
        <h3>${esc(p.days)} &middot; ${esc(p.name)} ${chip(p.proven)}</h3>
        <div class="meta">Owner: ${esc(p.owner)}</div>
        <div class="lab">Gate</div><div>${esc(p.gate)}</div>
        <div class="lab">Platform capability behind it</div><div>${esc(p.capability)}</div>
        <div class="lab">When it fails</div><div>${esc(p.failure)}</div>
      </div>`).join('')}

      <h2>The four failure paths the ticket names</h2>
      <p>An idealized plan is the named risk on this ticket, so these are written at the
      same level of detail as the happy path. Each threshold is a proposal and all four are
      yours to set.</p>
      ${failureTable()}`
    : `
      <h2>What gets measured</h2>
      ${measureTable(false)}

      <div class="pagebreak"></div>
      <h2>Each measure in full</h2>
      ${D.MEASURES.map((m) => `<div class="card ${m.attribution === D.ATTRIB.STRONG ? 'yes'
    : m.attribution === D.ATTRIB.PARTIAL ? 'partial' : 'no'}">
        <h3>${esc(m.what)} ${chip(m.attribution)}</h3>
        <div class="lab">Baseline</div><div>${esc(m.baseline)}</div>
        <div class="lab">Method</div><div>${esc(m.method)}</div>
        <div class="lab">Cadence</div><div>${esc(m.cadence)}</div>
        <div class="lab">Why that attribution strength</div><div>${esc(m.why)}</div>
      </div>`).join('')}

      <h2>The publication rule</h2>
      <p>${esc(D.PUBLICATION_RULE)}</p>`}

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(isRunbook ? D.DECISIONS[0] : D.DECISIONS[1])}
    </div>
  </div>`;

  return htmlDoc({
    title: isRunbook ? 'C7.5 - Pilot Operating Playbook'
      : 'C7.6 - Pilot Measurement and Baseline Framework',
    css,
    body,
  });
}

module.exports = { buildVisual, buildDocument };
