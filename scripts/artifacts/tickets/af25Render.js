/**
 * AF2.5's two PDFs: the one-page grant plan, and the access ledger document.
 *
 * Both read `af25Data` and nothing else, so the count on the picture and the count in the text
 * cannot disagree.
 */
const D = require('./af25Data');
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
  .stamp {
    border: 2px solid ${D.SEV.ok}; color: ${D.SEV.ok}; border-radius: 5px;
    padding: 7px 11px; font-weight: 700; margin: 0 0 12px; background: #f3f9f3;
  }
  .stamp.warn { border-color: ${D.SEV.bad}; color: ${D.SEV.bad}; background: #fdf3f2; }
`;

const STAMP = '<div class="stamp">FOUR GRANTS EXECUTED 16 Oct 2026 and verified. '
  + '<span style="font-weight:400">No email, invitation or notification has been sent to anyone. '
  + 'The four can sign in today; they have not been told.</span></div>';

/** The grant table. `role` is shown as the literal value that would be written. */
function grantTable(compact) {
  const order = [D.V.HELD, D.V.NO_SURFACE, D.V.CONFIRM, D.V.READY];
  const rows = [...D.PEOPLE].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
  return `<table>
  <tr><th>Intern</th><th>Domain</th><th>Would receive</th>${compact ? '' : '<th>Sign-in email</th>'}
      <th>Verdict</th></tr>
  ${rows.map((p) => `<tr>
    <td><strong>${esc(p.name)}</strong></td>
    <td><code>${esc(p.domain)}</code></td>
    <td>${p.role ? `staff + <code>${esc(p.role)}</code>` : '<em>nothing available</em>'}</td>
    ${compact ? '' : `<td style="font-size:8pt">${esc(p.email)}</td>`}
    <td><span class="chip" style="background:${p.verdict.color}">${esc(p.verdict.label)}</span></td>
  </tr>`).join('')}
  </table>`;
}

function grantFlow() {
  return `<figure><div class="mermaid">graph LR
  A["Intern signs in"] --> B{"community role<br/>= staff?"}
  B -- "no (all 7 today)" --> X["bridge returns null<br/>no management portal"]
  B -- "yes" --> C{"valid mgmt_role?"}
  C -- "no" --> X
  C -- "yes" --> D["scoped admin token"]
  D --> E["their section only"]
  style X fill:#fdf3f2,stroke:#b3261e,color:#2d3748
  style E fill:#f3f9f3,stroke:#2f7d32,color:#2d3748
  </div>
  <figcaption>Both conditions, or nothing. Setting <code>mgmt_role</code> alone leaves every
  intern on the left-hand branch while the table looks correct.</figcaption></figure>`;
}

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 9pt; }
    h1 { font-size: 15.5pt; }
    h2 { font-size: 9.5pt; margin: 10px 0 4px; }
    .wrap { display: flex; gap: 15px; }
    .col { flex: 1; }
    table { font-size: 7.8pt; } th { font-size: 6.8pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .chip { font-size: 6.4pt; padding: 1px 5px; }
    .takeaway { padding: 8px 11px; margin-bottom: 8px; }
    .takeaway .headline { font-size: 11pt; } .takeaway .label { font-size: 7pt; }
    .note { font-size: 7.6pt; padding: 7px 9px; margin: 6px 0; }
    .stamp { font-size: 8.5pt; padding: 6px 9px; margin-bottom: 9px; }
    .mermaid svg { max-height: 120px; }
    figcaption { font-size: 7pt; }
    .footer { margin-top: 8px; font-size: 6.8pt; color: var(--muted);
              border-top: 1px solid var(--border); padding-top: 5px; }`;

  const parts = [
    { label: `Ready (${D.COUNTS.ready})`, value: D.COUNTS.ready, color: D.SEV.ok },
    { label: `Confirm email (${D.COUNTS.confirm})`, value: D.COUNTS.confirm, color: D.SEV.watch },
    { label: `No surface (${D.COUNTS.noSurface})`, value: D.COUNTS.noSurface, color: D.SEV.bad },
    { label: `Held (${D.COUNTS.held})`, value: D.COUNTS.held, color: D.SEV.bad },
  ];

  const body = `
  <h1>AF2.5 &middot; Intern portal access, executed</h1>
  <div class="meta">Agent Factory &middot; measured ${esc(D.MEASURED_ON)} &middot; one page &middot; <strong>4 granted, nobody notified</strong></div>
  <div class="rule"></div>
  ${STAMP}

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="wrap">
    <div class="col">
      <h2>The seven, worst case first</h2>
      ${grantTable(true)}
      <h2>Where they stand</h2>
      ${stackBar({ parts, width: 400, height: 22 })}
    </div>
    <div class="col">
      <h2>Verified, not assumed</h2>
      <div class="note good" style="font-size:7.4pt;padding:7px 9px">
        ${D.EXECUTED.verification.map(([h, b]) => `<div><strong>${esc(h)}.</strong> ${esc(b)}</div>`).join("")}
      </div>
      ${grantFlow()}
    </div>
  </div>

  <div class="footer">
    Ruth Kumera is read here and written by nothing; her onboarding is AF6.2. Resolved by direct
    lookup against community_members and enrollments, not from a roster. Built from the same data
    module as the ledger document.
  </div>`;

  return htmlDoc({ title: 'AF2.5 grant plan, one page', css, body });
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}
    ol.tk { margin: 6px 0 0 18px; padding: 0; } ol.tk li { margin-bottom: 8px; }
    dl { margin: 6px 0; } dt { font-weight: 700; margin-top: 7px; }
    dd { margin: 2px 0 0 0; }`;

  const body = `
  <h1>AF2.5 &middot; Intern access ledger</h1>
  <div class="meta">Agent Factory &middot; Task AF2.5 &middot; P0 &middot; rollout blocker
    &middot; measured ${esc(D.MEASURED_ON)} &middot; prepared for Ali Muwwakkil</div>
  <div class="rule"></div>
  ${STAMP}

  <div class="askdel">
    <div class="row"><span class="lbl">Asked</span><span class="val">${esc(D.ASKED)}</span></div>
    <div class="row"><span class="lbl">Delivered</span><span class="val">${esc(D.DELIVERED)}</span>
    </div>
  </div>

  <div class="takeaway"><div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div></div>

  <ol class="tk">
    <li><strong>The grant is two changes per person, and the obvious half does nothing.</strong>
      <code>${esc(D.GRANT_SHAPE.gate)}</code> All seven are <code>student</code> today, so setting
      <code>mgmt_role</code> alone would leave every one of them unable to reach the management
      portal while the table looked correct. That is the AF2.6 shape exactly: a record that reads
      as access, and a route that still refuses.</li>
    <li><strong>Sarbjit Kaur has TWO enrollments with different addresses.</strong> The
      <code>community_members</code> row, and therefore any grant, hangs off
      <code>sarbjitsaini83@yahoo.com</code>. The second, <code>sarbjitsaini716@gmail.com</code>,
      created 4 August, has no community row at all. If she signs in with the gmail address the
      grant reaches nothing. <strong>Someone has to ask her which one she uses</strong> - this
      cannot be resolved from the database.</li>
    <li><strong>Mihret Netsereab has no surface to be granted.</strong> No admin path prefix maps
      to <code>product_experience</code> and a scoped role is deny-by-default on an unmapped path.
      There is nothing to grant her and no page was invented to close it.</li>
    <li><strong>Ruth Kumera is held, not worked around.</strong> Her row is read in this document
      and written by nothing. Her onboarding is AF6.2 and that decision has not been made.</li>
  </ol>

  <h2>The plan, one line per person</h2>
  ${grantTable(false)}
  ${D.PEOPLE.map((p) => `<p style="font-size:9pt"><strong>${esc(p.name)}</strong> &mdash;
    ${esc(p.note)}</p>`).join('')}

  <div class="pagebreak"></div>
  <h2>What the grant actually does</h2>
  ${grantFlow()}

  <h2>What flipping someone to <code>staff</code> costs</h2>
  <p>Read out of <code>staffAccess.ts</code>'s own header rather than inferred from the name.</p>
  <dl>
    <dt>It buys</dt><dd>${esc(D.STAFF_SIDE_EFFECTS.buys)}</dd>
    <dt>It does NOT buy</dt><dd>${esc(D.STAFF_SIDE_EFFECTS.doesNotBuy)}</dd>
    <dt>Worth a decision</dt><dd>${esc(D.STAFF_SIDE_EFFECTS.watchThis)}</dd>
  </dl>

  <h2>Ruth Kumera, snapshotted before anything</h2>
  <table><tr><th>Field</th><th>Value, ${esc(D.MEASURED_ON)}</th></tr>
    ${Object.entries(D.RUTH_BEFORE).map(([k, v]) =>
    `<tr><td><code>${esc(k)}</code></td><td>${esc(v)}</td></tr>`).join('')}
  </table>

  <div class="note warn">
    <strong>One acceptance criterion cannot be asserted as written.</strong>
    <br>It asks for: <em>${esc(D.UNASSERTABLE.asked)}</em>
    <br><br><strong>${esc(D.UNASSERTABLE.problem)}</strong>
    <br><br>Checkable instead: ${esc(D.UNASSERTABLE.whatIsCheckable)}
    <br><br><strong>Recommendation.</strong> ${esc(D.UNASSERTABLE.recommendation)}
  </div>

  <h2>The reversal</h2>
  <p><code>${esc(D.REVERSAL.command)}</code></p>
  <p>${esc(D.REVERSAL.why)}</p>
  <div class="note"><strong>Owed, not claimed.</strong> ${esc(D.REVERSAL.dryRun)}</div>

  <h2>Ready for Monday, and not sent</h2>
  <p>${esc(D.MONDAY_PACK.path)}</p>
  <table><tr><th>Intern</th><th>Signs in with</th><th>Reaches</th></tr>
    ${D.GRANTED_PEOPLE.map((p) => `<tr><td><strong>${esc(p.name)}</strong></td>
      <td><code>${esc(p.email)}</code></td>
      <td><code>${esc(D.MINTED_SECTIONS[p.role] || "")}</code></td></tr>`).join("")}
  </table>
  <div class="note warn"><strong>${esc(D.MONDAY_PACK.caveat)}</strong> Portal:
    <code>${esc(D.MONDAY_PACK.signIn)}</code></div>

  <h2>How the grant was proved</h2>
  <ul>${D.EXECUTED.verification.map(([h, b]) => `<li><strong>${esc(h)}.</strong> ${esc(b)}</li>`).join("")}</ul>

  <h2>What this does not establish</h2>
  <ul>
    <li><strong>No intern has signed in yet</strong>, which is the ticket's first acceptance
      criterion and is confirmed by the intern, not by reading this table. The bridge has been
      proved to mint them a correctly scoped token; that is not the same as a person logging in.</li>
    <li><strong>Nobody has been told.</strong> No email, invitation or notification of any kind
      has been sent, on instruction.</li>
    <li><strong>Sarbjit's address is unresolved</strong> and cannot be resolved from data.</li>
  </ul>

  <div class="meta" style="margin-top:16px;border-top:1px solid var(--border);padding-top:7px">
    Artifact for AF2.5, filed in 02 - Intern Management Portal and Access. Resolved by direct
    lookup against <code>community_members</code>, <code>enrollments</code> and
    <code>admin_users</code>. Built from the same data module as the one-page plan.
  </div>`;

  return htmlDoc({ title: 'AF2.5 intern access ledger', css, body });
}

module.exports = { buildVisual, buildDocument };
