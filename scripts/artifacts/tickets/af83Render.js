/**
 * AF8.3's two PDFs: the one-page go / no-go, and the runbook.
 *
 * The ticket asks for "a one-page runbook ... and a stated go / no-go". The one-pager IS the
 * decision page: Ali should be able to read it on Sunday and decide without opening anything
 * else. The document carries the per-intern evidence behind each line of it.
 */
const D = require('./af83Data');
const { esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .askdel .lbl {
    display: inline-block; min-width: 66px; font-size: 7.4pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: .07em; color: var(--muted); vertical-align: top;
    padding-top: 2px;
  }
  .askdel .val { display: inline-block; width: calc(100% - 74px); vertical-align: top; }
  .askdel .row { margin-bottom: 4px; }
  .verdict {
    border: 3px solid ${D.SEV.watch}; border-radius: 6px; padding: 9px 13px; margin: 0 0 11px;
    background: #fff8e6;
  }
  .verdict .v { font-size: 17pt; font-weight: 700; color: ${D.SEV.watch}; line-height: 1.1; }
  .verdict .h { font-size: 10.5pt; margin-top: 3px; }
`;

function readinessTable(compact) {
  return `<table>
  <tr><th>Can an intern do this on Monday?</th><th>Verdict</th>${compact ? '' : '<th>Evidence</th>'}</tr>
  ${D.READINESS.map((r) => `<tr>
    <td><strong>${esc(r.item)}</strong></td>
    <td><span class="chip" style="background:${r.verdict.color}">${esc(r.verdict.label)}</span></td>
    ${compact ? '' : `<td style="font-size:8pt">${esc(r.evidence)}</td>`}
  </tr>`).join('')}
  </table>`;
}

function walkTable() {
  return `<table>
  <tr><th>Intern</th><th>Domain</th><th>Sections on their token</th><th>Own</th><th>Foreign</th>
      <th>My Domain</th><th>Rows shown</th></tr>
  ${D.WALKTHROUGH.map((w) => `<tr>
    <td><strong>${esc(w.name)}</strong></td><td><code>${esc(w.domain)}</code></td>
    <td style="font-size:8pt">${esc(w.sections)}</td>
    <td style="color:${D.SEV.ok}"><strong>${w.own}</strong></td>
    <td style="color:${D.SEV.ok}">${esc(w.foreign)}</td>
    <td style="color:${D.SEV.ok}">${w.myDomain}</td>
    <td style="color:${D.SEV.bad}"><strong>${w.rows}</strong></td>
  </tr>`).join('')}
  </table>`;
}

function flow() {
  return `<figure><div class="mermaid">graph LR
  A["Intern signs in"] --> B["Employee nav<br/>Management Portal"]
  B --> C["Scoped admin token"]
  C --> D["Their department<br/>VERIFIED 200"]
  C --> E["My Domain<br/>opens, 0 rows"]
  C --> F["Agent console<br/>NOT BUILT"]
  C --> G["Their repo<br/>NOT BUILT"]
  style D fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  style E fill:#fff8e6,stroke:#b26a00,color:#2d3748
  style F fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style G fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  </div><figcaption>Monday, as measured. Green was walked through in production today; red does
  not exist.</figcaption></figure>`;
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; }
    h1 { font-size: 15.5pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; }
    .wrap { display: flex; gap: 14px; } .col { flex: 1; }
    table { font-size: 7.6pt; } th { font-size: 6.8pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .chip { font-size: 6.4pt; padding: 1px 5px; }
    .verdict { padding: 7px 11px; margin-bottom: 8px; } .verdict .v { font-size: 15pt; }
    .verdict .h { font-size: 9.5pt; }
    .note { font-size: 7.5pt; padding: 7px 9px; margin: 5px 0; }
    .mermaid svg { max-height: 110px; } figcaption { font-size: 7pt; }
    .footer { margin-top: 7px; font-size: 6.8pt; color: var(--muted);
              border-top: 1px solid var(--border); padding-top: 4px; }`;

  const parts = [
    { label: `Verified (${D.COUNTS.ready})`, value: D.COUNTS.ready, color: D.SEV.ok },
    { label: 'Loads empty (1)', value: 1, color: D.SEV.watch },
    { label: `Not ready (${D.COUNTS.notReady})`, value: D.COUNTS.notReady, color: D.SEV.bad },
  ];

  const body = `
  <h1>AF8.3 &middot; ${esc(D.KICKOFF)} kickoff &mdash; go / no-go</h1>
  <div class="meta">Every line measured against production ${esc(D.MEASURED_ON)} with the
    interns' own tokens &middot; nothing sourced from a ticket status</div>
  <div class="rule"></div>

  <div class="verdict">
    <div class="v">${esc(D.GO_NO_GO.verdict)}</div>
    <div class="h">${esc(D.GO_NO_GO.headline)}</div>
  </div>

  <div class="wrap">
    <div class="col">
      <h2>The six walkthroughs, performed not imagined</h2>
      ${walkTable()}
      <div class="note good" style="font-size:7.4pt">
        <strong>${D.COUNTS.ownOk} of ${D.COUNTS.interns} reach their own surface.
        ${D.COUNTS.leaks} leaks across ${D.COUNTS.foreignProbes} foreign probes.</strong>
        The scoping holds.
      </div>
    </div>
    <div class="col">
      <h2>What Monday actually offers</h2>
      ${readinessTable(true)}
      ${stackBar({ parts, width: 380, height: 20 })}
      <div class="note warn" style="font-size:7.4pt;margin-top:7px">
        <strong>Not built means not built.</strong> The agent console (AF2.2) and the intern
        repos (AF4.1) have no work against them, and neither is a weekend build. Promising
        either on Monday is how seven people spend the day looking for a surface that is not
        there.
      </div>
    </div>
  </div>

  <div class="note warn" style="font-size:7.6pt">
    <strong>The one that decides the shape of the day.</strong> ${esc(D.EMPTY_PAGE.what)}
    ${esc(D.EMPTY_PAGE.measured)} ${esc(D.GO_NO_GO.tellThem)}
  </div>

  <div class="footer">
    Ruth Kumera is not granted and not routed around (AF6.2). The go / no-go is Ali's; this page
    is the evidence for it.
  </div>`;

  return htmlDoc({ title: 'AF8.3 Monday go / no-go', css, body });
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}
    ol.tk { margin: 6px 0 0 18px; } ol.tk li { margin-bottom: 8px; }`;

  const body = `
  <h1>AF8.3 &middot; ${esc(D.KICKOFF)} kickoff runbook</h1>
  <div class="meta">Agent Factory &middot; P0 &middot; rollout gate &middot; measured
    ${esc(D.MEASURED_ON)} &middot; prepared for Ali Muwwakkil</div>
  <div class="rule"></div>

  <div class="askdel">
    <div class="row"><span class="lbl">Asked</span><span class="val">${esc(D.ASKED)}</span></div>
    <div class="row"><span class="lbl">Delivered</span><span class="val">${esc(D.DELIVERED)}</span></div>
  </div>

  <div class="verdict">
    <div class="v">${esc(D.GO_NO_GO.verdict)}</div>
    <div class="h">${esc(D.GO_NO_GO.headline)}</div>
  </div>

  <ol class="tk">
    <li><strong>Go on department access.</strong> ${esc(D.GO_NO_GO.go)}</li>
    <li><strong>No-go on the agent half.</strong> ${esc(D.GO_NO_GO.noGo)}</li>
    <li><strong>What to tell them.</strong> ${esc(D.GO_NO_GO.tellThem)}</li>
  </ol>

  <h2>How every line here was obtained</h2>
  <p>Each intern's own token was minted through the bridge and used to call
    <code>enterprise.colaberry.ai</code> directly. No claim below comes from a ticket status, and
    none comes from an admin session &mdash; an admin reaches everything, so an admin walkthrough
    proves nothing about an intern.</p>
  <p><strong>Two of my own probes were wrong first, and the corrections matter.</strong> An early
    run reported three interns failing on their own surface; those were 404s from probing root
    paths like <code>/api/admin/internship</code> that have no GET handler. Re-probed against the
    real endpoints, the failures were zero. A 404 there meant I guessed the path, not that an
    intern was locked out.</p>

  <h2>The six walkthroughs</h2>
  ${walkTable()}
  <p><strong>${D.COUNTS.ownOk} of ${D.COUNTS.interns}</strong> reach their own surface.
    <strong>${D.COUNTS.leaks} leaks</strong> across ${D.COUNTS.foreignProbes} foreign probes.
    <strong>${D.COUNTS.myDomainReachable} of ${D.COUNTS.interns}</strong> can open My Domain, and
    <strong>${D.COUNTS.myDomainEmpty} of ${D.COUNTS.interns}</strong> would find it empty.</p>

  <div class="pagebreak"></div>
  <h2>Readiness, line by line</h2>
  ${readinessTable(false)}
  ${flow()}

  <h2>The blocker found and fixed today</h2>
  <p><strong>All six interns got 403 on the page built for them.</strong>
    <code>/api/admin/agent-domains*</code> was absent from the gate's path table, so
    <code>pathToSection</code> returned null and a scoped role was denied by default, before any
    router middleware ran. Nothing in the route file hinted at it. Fixed, deployed, and re-walked:
    all six now return 200.</p>
  <p>It was invisible to reading and obvious to walking, which is the entire argument for this
    ticket's method.</p>

  <h2>The blocker found and NOT fixed</h2>
  <div class="note warn"><strong>${esc(D.EMPTY_PAGE.what)}</strong><br>${esc(D.EMPTY_PAGE.why)}
    <br><br><strong>Measured:</strong> ${esc(D.EMPTY_PAGE.measured)}
    <br><br><strong>Known since AF2.4:</strong> ${esc(D.EMPTY_PAGE.knownSince)}</div>
  <p>Three ways out, none of them free:</p>
  <ol>${D.EMPTY_PAGE.options.map(([h, b]) =>
    `<li><strong>${esc(h)}.</strong> ${esc(b)}</li>`).join('')}</ol>

  <h2>Ruth Kumera</h2>
  <p>${esc(D.RUTH.state)}</p>

  <h2>What this runbook does not establish</h2>
  <ul>
    <li><strong>No intern has actually signed in.</strong> Their tokens were minted server-side
      and used to call the API. No <code>attendance</code> or <code>session_pulse</code> row
      exists for any of these accounts, so nothing records a human logging in. The ticket's own
      criterion is confirmation by the intern, and that cannot be done for them.</li>
    <li><strong>The browser experience is untested.</strong> Everything here is HTTP. Whether the
      nav renders their group and the page paints is not proved by a 200.</li>
    <li><strong>Nobody has been emailed.</strong> Six people can sign in today and do not know it.</li>
  </ul>

  <div class="meta" style="margin-top:14px;border-top:1px solid var(--border);padding-top:6px">
    Artifact for AF8.3, filed in 08 - Rollout, Evidence and Kickoff. Built from the same data
    module as the one-page go / no-go.
  </div>`;

  return htmlDoc({ title: 'AF8.3 Monday kickoff runbook', css, body });
}

module.exports = { buildVisual, buildDocument };
