/**
 * C8.11 - renders the one-page finding and the full handover audit.
 *
 * Both read c811Data, whose guards refuse a hedged verdict, a failure with no stated way
 * to close it, a document that has stopped saying the flow already exists, and a
 * deployment refusal described as anything other than governance.
 */
const D = require('./c811Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .met{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
       font-weight:700;padding:2px 8px;border-radius:3px}
  .notmet{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
          font-weight:700;padding:2px 8px;border-radius:3px}
  .gov{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
       font-weight:700;padding:2px 8px;border-radius:3px}
  .scope{display:inline-block;background:#fff7ed;color:#9a3412;font-size:9px;
         font-weight:700;padding:2px 8px;border-radius:3px}
  .struct{display:inline-block;background:#eef2ff;color:#3730a3;font-size:9px;
          font-weight:700;padding:2px 8px;border-radius:3px}
  .num{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
       margin:8px 0}
  .ok{background:#f0fdf4;border-left:3px solid #2f7d32;padding:9px 11px;font-size:11px;
      margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * The flow, drawn as the chain it already is, with the row count under each link.
 *
 * Every box exists in code. Every one holds zero rows. That juxtaposition is the finding,
 * and a table of names would not carry it the way an unbroken chain of zeroes does.
 */
function chain(w = 940) {
  const steps = [
    { label: 'Cut candidate', sub: 'createReleaseCandidate', table: 'delivery_releases', n: 0 },
    { label: 'Record checks', sub: '10-check handover list', table: 'check_results', n: 0 },
    { label: 'Claim evidence', sub: 'NEW in this change', table: 'delivery_evidence', n: 0, isNew: true },
    { label: 'Approve', sub: 'named person, timestamped', table: 'approved_by', n: 0 },
    { label: 'Client sees it', sub: 'ClientPortal Releases tab', table: 'acceptances', n: 0 },
  ];
  const gap = 10;
  const colW = (w - gap * (steps.length - 1)) / steps.length;
  const h = 128;

  const cols = steps.map((s, i) => {
    const x = i * (colW + gap);
    const stroke = s.isNew ? '#0f766e' : '#94a3b8';
    const fill = s.isNew ? '#f0fdfa' : '#f8fafc';
    return `<rect x="${x}" y="16" width="${colW}" height="72" rx="4"
        fill="${fill}" stroke="${stroke}" stroke-width="${s.isNew ? 1.6 : 1}"/>
      <text x="${x + colW / 2}" y="38" text-anchor="middle" font-size="11"
        font-weight="700" fill="#334155">${esc(s.label)}</text>
      <text x="${x + colW / 2}" y="52" text-anchor="middle" font-size="8"
        fill="#64748b">${esc(s.sub)}</text>
      <text x="${x + colW / 2}" y="70" text-anchor="middle" font-size="8.5"
        fill="#64748b"><tspan font-family="monospace">${esc(s.table)}</tspan></text>
      <text x="${x + colW / 2}" y="82" text-anchor="middle" font-size="9"
        font-weight="700" fill="#b3261e">${s.n} rows</text>
      ${i < steps.length - 1 ? `<text x="${x + colW + 1}" y="56" font-size="12"
        fill="#94a3b8">&#8250;</text>` : ''}
      ${s.isNew ? `<text x="${x + colW / 2}" y="104" text-anchor="middle" font-size="8"
        font-weight="700" fill="#0f766e">the one real hole, now closed</text>` : ''}`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="The five-step release and handover chain, every step already built in
    code and every one holding zero rows">
    <text x="0" y="9" font-size="9" font-weight="700" fill="#64748b">
      THE HANDOVER CHAIN THAT ALREADY EXISTS, WITH PRODUCTION ROW COUNTS</text>
    ${cols}</svg>`;
}

/** One page: the flow exists, it has never run, and here are the three decisions. */
function buildVisual() {
  const total = D.assertEveryVerdictIsBinaryAndActionable();
  D.assertThePremiseCorrectionSurvives();
  D.assertTheDeploymentRefusalIsNamedAsGovernance();
  const m = D.MEASURED;
  const r = D.RECOMMENDATION;

  const crit = D.CRITERIA.map((c) => `<tr>
      <td style="width:5%"><span class="num">${c.n}</span></td>
      <td style="width:48%"><strong>${esc(c.name)}</strong></td>
      <td style="width:12%"><span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${c.verdict}</span></td>
      <td>Waiting on ${esc(c.blockedOn)}</td></tr>`).join('');

  const dec = D.DECISIONS.map((d) => {
    const cls = d.kind === 'GOVERNANCE' ? 'gov' : (d.kind === 'SCOPE' ? 'scope' : 'struct');
    return `<li><span class="${cls}">${esc(d.kind)}</span>
      <strong>${esc(d.question)}</strong></li>`;
  }).join('');

  const body = `
    <h1 style="margin:0">The handover flow already exists. It has never been run once.</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C8.11 &#183; measured against
    production ${esc(D.AS_OF)} &#183; ${total} criteria, none met, none for want of a flow</p>

    <div class="bad" style="margin-top:9px"><strong>${esc(r.verdict)}</strong>
    ${esc(r.because)}</div>

    ${chain()}

    <table style="margin-top:2px"><thead><tr><th>#</th><th>Criterion</th>
      <th>Verdict</th><th>Blocked on</th></tr></thead><tbody>${crit}</tbody></table>

    <div class="key"><strong>Three decisions, and two of them are not engineering.</strong>
    <ul style="margin:4px 0 0 2px;list-style:none">${dec}</ul></div>

    <p style="font-size:11px;color:#64748b;margin-top:4px"><strong>The deepest finding:</strong>
    of the ${m.verifiedStudentProjects} student projects carrying commit-verified work
    across ${m.verifiedStudentStories} verified stories,
    <strong>${m.verifiedProjectsLinkedToDelivery} are linked to a delivery project</strong>.
    Even a finished flow with a UI would currently have nothing to hand over.</p>`;

  return htmlDoc({ title: 'C8.11 handover flow audit', css: baseCss() + SHARED, body });
}

/** The full audit. */
function buildDocument() {
  D.assertEveryVerdictIsBinaryAndActionable();
  D.assertThePremiseCorrectionSurvives();
  D.assertTheDeploymentRefusalIsNamedAsGovernance();
  D.assertTheDisconnectIsStated();
  const m = D.MEASURED;
  const r = D.RECOMMENDATION;

  const body = `
    <h1>C8.11 &#183; Deployment candidate selection and handover</h1>
    <p class="lede" style="font-size:13px">The ticket says no selection or handover flow
    exists. One exists end to end. It holds zero rows because it has never been run, which
    is a different problem and has a different fix.</p>

    <div class="bad"><strong>${esc(r.verdict)}</strong> ${esc(r.because)}</div>

    <h2>What is already built</h2>
    <table>
      <thead><tr><th style="width:22%">Piece</th><th style="width:30%">Where</th>
        <th>What it does</th></tr></thead>
      <tbody>${D.EXISTING.map((e) => `<tr>
        <td><strong>${esc(e.piece)}</strong></td>
        <td><code>${esc(e.where)}</code></td>
        <td>${esc(e.detail)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>Why all of it is empty</h2>
    <table><tbody>
      <tr><td style="width:56%">Delivery projects</td>
        <td>${m.deliveryProjects} (${esc(m.deliveryProjectsByStatus)})</td></tr>
      <tr><td>Delivery stories</td><td>${m.deliveryStories}</td></tr>
      <tr><td>Delivery releases</td><td>${m.deliveryReleases}</td></tr>
      <tr><td>Delivery evidence rows</td><td>${m.deliveryEvidence}</td></tr>
      <tr><td>Client acceptances</td><td>${m.deliveryClientAcceptances}</td></tr>
      <tr><td>Lifecycle rows, and how many past discovery</td>
        <td>${m.lifecycleRows}, of which ${m.lifecycleRowsPastDiscovery}</td></tr>
      <tr><td>Sponsors / sponsor seats</td><td>${m.sponsors} / ${m.sponsorSeats}</td></tr>
    </tbody></table>
    <p>No delivery project has a single story, so there has never been anything to cut a
    release from. The subsystem's own implementation status records the deployment state
    as NOT DEPLOYED with its seven required end-to-end scenarios unexecuted.</p>

    <h2>Each criterion</h2>
    ${D.CRITERIA.map((c) => `
      <h3><span class="num">${c.n}</span>${esc(c.name)}
        <span class="${c.verdict === 'MET' ? 'met' : 'notmet'}">${c.verdict}</span></h3>
      <p><strong>Evidence.</strong> ${esc(c.evidence)}</p>
      <p><strong>What would close it.</strong> ${esc(c.toClose)}</p>`).join('')}

    <h2>What this change shipped</h2>
    <p><strong>${esc(D.SHIPPED.what)}.</strong> ${esc(D.SHIPPED.why)}</p>
    <p><code>${esc(D.SHIPPED.files)}</code></p>
    <ul>${D.SHIPPED.properties.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>

    <h2>Three decisions</h2>
    ${D.DECISIONS.map((d) => {
    const cls = d.kind === 'GOVERNANCE' ? 'gov' : (d.kind === 'SCOPE' ? 'scope' : 'struct');
    return `<h3><span class="num">${d.n}</span>${esc(d.question)}
        <span class="${cls}">${esc(d.kind)}</span></h3>
      <p>${esc(d.detail)}</p>
      <p><strong>Why it matters.</strong> ${esc(d.why)}</p>`;
  }).join('')}

    <h2>What to do</h2>
    <div class="ok">${esc(r.smallestPathToUseful)}</div>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}. All
    production figures read read-only. The data module refuses a hedged verdict, a
    failure with no stated way to close it, a version of this document that has stopped
    saying the flow already exists, and any description of the deployment refusal as
    something other than governance.</p>`;

  return htmlDoc({
    title: 'C8.11 deployment candidate selection and handover',
    css: baseCss() + SHARED,
    body,
  });
}

module.exports = { buildVisual, buildDocument };
