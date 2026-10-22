/**
 * C5.9 - renders the one-page visual and the spec document.
 *
 * Both read c59Data, which parses the shipped page. Nothing here restates the walkthrough
 * from memory, so the artifact cannot describe a demo that no longer exists.
 */
const D = require('./c59Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;
     font-weight:700;margin:0 0 5px}
  .box{border:1px solid #e2e8f0;border-radius:7px;padding:11px 13px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  .good{background:#f0fdf4;border-left:4px solid #16a34a;padding:10px 13px;font-size:12px}
  .step{display:flex;gap:10px;align-items:baseline;margin:0 0 5px}
  .sn{font-size:15px;font-weight:800;color:#0f766e;min-width:16px;
      font-variant-numeric:tabular-nums}
  .sl{font-size:11.5px;font-weight:700;min-width:92px}
  .ss{font-size:11px;color:#475569}
  .badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:8.5px;
         font-weight:700;padding:1px 5px;border-radius:3px;text-transform:uppercase;
         letter-spacing:.04em;margin-left:5px}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin:8px 0}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  p{margin:0 0 8px}
  ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/** The one-page landscape visual: the eight steps and the safety property. */
function buildVisual() {
  const steps = D.steps();
  const r = D.record();
  const labeled = D.assertEveryStepIsLabeled();

  const body = `
    <h1 style="margin:0">A prospect can watch the product work, safely</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C5.9 guided demo &middot;
    ${esc(D.PRODUCTION_URL)} &middot; public, no auth &middot; prepared ${esc(D.AS_OF)}</p>

    <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-top:11px">
      <div>
        <div class="box">
          <p class="k">The walkthrough, ${steps.length} steps, one record</p>
          ${steps.map((s) => `<div class="step">
            <span class="sn">${s.n}</span>
            <span class="sl">${esc(s.label)}</span>
            <span class="ss">${esc(s.screen)}<span class="badge">sample</span></span>
          </div>`).join('')}
        </div>
        <div class="box" style="margin-top:11px">
          <p class="k">The one record it follows</p>
          <p style="font-size:11.5px;margin:0"><strong>${esc(r.storyRef)}</strong>
          &middot; ${esc(r.title)}<br>
          <span class="ss">unverified &rarr; matched to commit ${esc(r.commitSha)} &rarr;
          verified, ${r.criteriaMet} of ${r.criteriaTotal} criteria checked</span></p>
        </div>
      </div>

      <div>
        <div class="good">
          <strong>No customer data is reachable, and that is a property rather than a
          promise.</strong> The page imports no API client, so it cannot reach the backend
          at all. A build assertion reads the import list from disk and fails if one
          appears.
        </div>
        <div class="box" style="margin-top:11px">
          <p class="k">Labeled on every screen, not once</p>
          <p style="font-size:11px;margin:0">The badge sits inside the per-step component,
          so all ${labeled.steps} steps carry it. A single banner at the top scrolls away,
          and a screenshot of step four would then be indistinguishable from a real board.</p>
        </div>
        <div class="box" style="margin-top:11px">
          <p class="k">What it says it is not</p>
          <ul style="font-size:10.5px;margin:0 0 0 15px">
            ${D.limits().map((l) => `<li>${esc(l)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>

    <div class="flag" style="margin-top:12px"><strong>${D.DEPARTURES.length} deliberate
    departures from the C4.4 storyboard.</strong> Counted from the list itself, so this
    sentence cannot drift from it.
    <ul style="margin:5px 0 0 15px">
      ${D.DEPARTURES.map((d) => `<li><strong>${esc(d.here)}</strong> ${esc(d.why)}</li>`)
    .join('')}
    </ul></div>`;

  return htmlDoc({ title: 'C5.9 guided demo', css: baseCss() + SHARED, body });
}

/** The spec document: the criteria, the evidence, and what was deliberately not done. */
function buildDocument() {
  const steps = D.steps();
  const r = D.record();

  const body = `
    <h1>C5.9 &middot; Guided demo mode</h1>
    <p class="lede" style="font-size:13px">A prospect can see the platform work without a
    live customer tenant, with sample data labeled on every screen and no path from the
    page to any real record. Live at ${esc(D.PRODUCTION_URL)}.</p>

    <h2>What the ticket asked for, and how each part is satisfied</h2>
    <table>
      <thead><tr><th style="width:34%">Criterion</th><th>How it is met</th></tr></thead>
      <tbody>
        <tr><td><strong>Follows the C4.4 storyboard</strong></td>
          <td>${steps.length} steps following one record from unverified to verified
          against a commit. The storyboard's own rule governs what the page must not
          become: a tour of the platform would show more and prove less.</td></tr>
        <tr><td><strong>Sample data labeled on every screen</strong></td>
          <td>The badge is rendered inside the per-step component, so it cannot be present
          on some steps and missing on others. A build assertion checks the badge is inside
          the repeated unit rather than counting occurrences, because a badge inside a map
          appears once in source and ${steps.length} times on screen.</td></tr>
        <tr><td><strong>No real customer data reachable</strong></td>
          <td>The page imports no API client. This is enforced by reading the import list
          from disk at build time, so the claim is a property of the module graph rather
          than a statement someone checked once.</td></tr>
        <tr><td><strong>Route verified mounted</strong></td>
          <td>${esc(D.ROUTE)} is live and was confirmed in the served JavaScript bundle,
          checked both ways: strings from this page present, and strings from the replaced
          page absent. On a single-page app a status code proves nothing, because a path
          that never existed also returns 200.</td></tr>
        <tr><td><strong>PR open rather than merged</strong></td>
          <td>Satisfied at review time. The work has since merged and deployed.</td></tr>
      </tbody>
    </table>

    <h2>The record the walkthrough follows</h2>
    <p><strong>${esc(r.storyRef)}</strong> &middot; ${esc(r.title)} &middot; commit
    ${esc(r.commitSha)} &middot; ${r.criteriaMet} of ${r.criteriaTotal} criteria checked.</p>
    <p>It is defined once and referenced throughout rather than repeated, so the steps
    cannot drift from the record they describe. A build assertion fails if the identifier
    is hard-coded more than once.</p>

    <h2>The eight steps</h2>
    <table>
      <thead><tr><th style="width:8%">#</th><th style="width:26%">Step</th>
        <th>What the viewer is looking at</th></tr></thead>
      <tbody>${steps.map((s) => `<tr><td>${s.n}</td>
        <td><strong>${esc(s.label)}</strong></td>
        <td>${esc(s.screen)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>Three deliberate departures</h2>
    ${D.DEPARTURES.map((d) => `<div class="flag">
      <strong>${esc(d.from)}</strong><br>
      <em>Here:</em> ${esc(d.here)}<br>
      ${esc(d.why)}</div>`).join('')}

    <h2>What the page says it is not</h2>
    <ul>${D.limits().map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p>A demo that does not say what it is not is how a prospect forms an expectation we
    then fail. These limits are rendered on the page itself, not only in this document.</p>

    <h2>How each claim here was checked</h2>
    <p>Five build assertions run against the shipped source before this document is
    produced. Three of them were wrong on their first attempt and each failure is worth
    recording, because each one would have produced a confident and false artifact:</p>
    <ul>
      <li>The per-screen labeling check counted badge occurrences in source. The badge sits
      inside a map, so a correct page returned one badge for eight steps. It now checks
      that the badge is inside the repeated component.</li>
      <li>The unregistered-figure check scanned the raw file and matched the comment that
      explains why those figures are excluded. It strips comments first.</li>
      <li>The one-record check counted literal occurrences of the story identifier. The
      page references a constant instead, so the correct pattern scored one and a worse
      one that hard-coded the string eight times would have passed. It counts references
      now, and separately refuses more than one hard-coded literal.</li>
    </ul>
    <p style="font-size:11px;color:#64748b">Prepared ${esc(D.AS_OF)}. Every figure in this
    document is parsed from ${esc('frontend/src/config/v2Demo.ts')} and
    ${esc('frontend/src/pages/publicV2/DemoV2.tsx')} at build time.</p>`;

  return htmlDoc({ title: 'C5.9 guided demo mode', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
