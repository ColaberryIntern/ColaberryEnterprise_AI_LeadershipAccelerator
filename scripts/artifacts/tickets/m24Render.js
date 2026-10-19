/**
 * M24 renderers. Presentation only; every figure comes from m24Data.
 *
 * The visual carries ONE thing, because one thing is what the ticket asked for: the answer, and
 * the single reason it is not yes. The document carries the input-by-input table and the proof.
 */
const { esc, baseCss, stackBar, SEV } = require('../artifactTheme');
const D = require('./m24Data');

const SHARED = `
  .two { display: flex; gap: 16px; } .two > * { flex: 1; min-width: 0; }
  .verdict { background: #fdf3f2; border-left: 5px solid ${SEV.bad}; padding: 10px 13px;
             border-radius: 0 5px 5px 0; margin: 0 0 10px; }
  .verdict .v { font-size: 17pt; font-weight: 700; color: ${SEV.bad}; line-height: 1; }
  .verdict .h { font-size: 9.5pt; margin-top: 5px; }
  .footer { margin-top: 10px; font-size: 7.4pt; color: var(--muted);
            border-top: 1px solid var(--border); padding-top: 5px; }
  td.v { font-weight: 700; white-space: nowrap; }
`;

const safeRows = () => D.INPUTS.filter((i) => i.verdict === 'SAFE');
const excludedRows = () => D.INPUTS.filter((i) => i.verdict === 'EXCLUDED');

function inputTable(rows, withComponent = true) {
  const body = rows.map((i) => `
    <tr>
      ${withComponent ? `<td>${esc(i.component)}</td>` : ''}
      <td><code>${esc(i.group)}</code></td>
      <td><code>${esc(i.field)}</code></td>
      <td>${esc(i.md)}</td>
      <td>${esc(i.absence)}</td>
      <td class="v" style="color:${i.verdict === 'SAFE' ? SEV.ok : SEV.bad}">${esc(i.verdict)}</td>
    </tr>`).join('');
  return `<table><thead><tr>
    ${withComponent ? '<th>Component</th>' : ''}
    <th>Group</th><th>Field</th><th>M/D</th><th>When absent</th><th>v1</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

/** The defect as a flow: the finding is about ORDER of evaluation, not quantity. */
const ENGAGEMENT_DIAGRAM = (dir) => `<div class="mermaid">
graph ${dir}
  A["a person with NO visitor record"] --> B["aggregate with no GROUP BY<br/>returns ONE row anyway"]
  B --> C["so the null-guard below<br/>can never fire"]
  C --> D["sessions: 0<br/>identical to a visitor who never returned"]
</div>`;

function buildVisual() {
  const css = `${baseCss()}${SHARED}
    body { font-size: 8.8pt; }
    h1 { font-size: 15pt; } h2 { font-size: 9.5pt; margin: 9px 0 4px; border-bottom-width: 1.5px; }
    .cards { gap: 7px; margin: 8px 0 9px; } .card { padding: 6px 8px; }
    .card .n { font-size: 15.5pt; } .card .k { font-size: 6.4pt; }
    table { font-size: 7.2pt; margin: 5px 0 7px; }
    th { font-size: 6.6pt; padding: 3px 5px; } td { padding: 3px 5px; }
    .note { font-size: 7.4pt; padding: 6px 9px; margin: 6px 0; }
    .mermaid svg { max-height: 170px; } figcaption { font-size: 6.8pt; }
    code { font-size: 7pt; } .verdict { padding: 8px 11px; } .verdict .v { font-size: 15pt; }`;

  const cards = [
    { n: D.COUNTS.inputs, k: 'inputs the score needs' },
    { n: D.COUNTS.safe, k: 'safe today' },
    { n: D.COUNTS.excluded, k: 'excluded from v1' },
    { n: D.COUNTS.evidenceGroups, k: 'evidence groups bound' },
    { n: D.TO_YES.length, k: 'things between here and yes' },
  ].map((c) => `<div class="card"><div class="n">${esc(c.n)}</div>
      <div class="k">${esc(c.k)}</div></div>`).join('');

  const parts = [
    { label: `Safe (${D.COUNTS.safe})`, value: D.COUNTS.safe, color: SEV.ok },
    { label: `Excluded (${D.COUNTS.excluded})`, value: D.COUNTS.excluded, color: SEV.bad },
  ];

  const toYes = D.TO_YES.map((t) => `
    <tr><td style="width:14px"><strong>${t.n}</strong></td><td>${esc(t.what)}</td>
    <td class="v" style="color:${t.who === 'Ali' ? SEV.watch : SEV.ok}">${esc(t.who)}</td></tr>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; Is Person 360 trustworthy enough to score?</h1>
  <div class="meta">Measured ${esc(D.MEASURED_ON)} against the real tree &middot;
    every input read out of the source, not inferred</div>
  <div class="rule"></div>

  <div class="verdict">
    <div class="v">${esc(D.VERDICT)}</div>
    <div class="h">${esc(D.TAKEAWAY)}</div>
  </div>

  <div class="cards">${cards}</div>

  <div class="two">
    <div>
      <h2>The ${D.COUNTS.excluded} inputs that cannot be used yet, and why</h2>
      ${inputTable(excludedRows(), false)}
      ${stackBar({ parts, width: 420, height: 18 })}
    </div>
    <div>
      <h2>The defect that decides the answer</h2>
      <figure>
        ${ENGAGEMENT_DIAGRAM('TD')}
        <figcaption><code>engagement</code>, the one group whose registry anchor is a bare table
          name and the only one with no behavioral test of its contents.</figcaption>
      </figure>
      <div class="note warn">
        <strong>An absent input must never score as zero.</strong> That is this ticket's own
        acceptance criterion, and it is the one the passive-browsing component fails.
      </div>
    </div>
  </div>

  <h2>What stands between here and yes</h2>
  <table><tbody>${toYes}</tbody></table>

  <div class="footer">${esc(D.CODE)} &middot; visual, one page &middot; built from the same data
    module as the document &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} SRS input contract (visual)` };
}

function buildDocument() {
  const css = `${baseCss()}${SHARED}`;

  const defects = D.DEFECTS.map((d) => `
    <h3>Defect ${esc(d.id)} &mdash; ${esc(d.title)}</h3>
    <p><code>${esc(d.cite)}</code></p>
    <p>${esc(d.detail)}</p>
    <div class="note warn">${esc(d.aggravation)}</div>`).join('');

  const blockers = D.BLOCKERS.map((b) => `
    <tr><td><strong>${esc(b.ticket)}</strong></td><td>${esc(b.state)}</td>
    <td>${esc(b.effect)}</td></tr>`).join('');

  const toYes = D.TO_YES.map((t) => `
    <tr><td><strong>${t.n}</strong></td><td>${esc(t.what)}</td>
    <td class="v" style="color:${t.who === 'Ali' ? SEV.watch : SEV.ok}">${esc(t.who)}</td>
    <td>${esc(t.size)}</td></tr>`).join('');

  const notEstablished = D.NOT_ESTABLISHED.map((n) => `<li>${esc(n)}</li>`).join('');

  const body = `
  <h1>${esc(D.CODE)} &middot; ${esc(D.TITLE)}</h1>
  <div class="meta">Measured ${esc(D.MEASURED_ON)} &middot; Growth OS reset, Phase 3</div>
  <div class="rule"></div>

  <p><strong>The ticket asked:</strong> ${esc(D.ASKED)}<br>
     <strong>Delivered:</strong> ${esc(D.DELIVERED)}</p>

  <div class="verdict">
    <div class="v">${esc(D.VERDICT)}</div>
    <div class="h">${esc(D.TAKEAWAY)}</div>
  </div>

  <h2>1. All ${D.COUNTS.inputs} inputs, bound to their evidence</h2>
  <p>Components are from DECISION 3, 4 and 5 of the contract. <strong>M</strong> means counted
    from a source table; <strong>D</strong> means computed from other fields already loaded. The
    question for each is not "is there a number" but "does the number lie when the evidence is
    missing".</p>
  ${inputTable(D.INPUTS)}
  <figure>
    ${stackBar({
    parts: [
      { label: `Safe (${D.COUNTS.safe})`, value: D.COUNTS.safe, color: SEV.ok },
      { label: `Excluded (${D.COUNTS.excluded})`, value: D.COUNTS.excluded, color: SEV.bad },
    ],
    width: 660,
    height: 24,
  })}
    <figcaption>${D.COUNTS.safe} of ${D.COUNTS.inputs} inputs already handle absence correctly.
      The ${D.COUNTS.excluded} excluded are not wrong by a little; each one reports a real number
      where it has no evidence.</figcaption>
  </figure>

  <h2>2. The two defects, both read out of the source</h2>
  ${defects}
  <figure>${ENGAGEMENT_DIAGRAM('LR')}
    <figcaption>Defect A as a sequence. The guard exists and is correct; it simply cannot run.
    </figcaption></figure>

  <h2>3. How the contract is bound, and how that binding was proved</h2>
  <p>A document can name an evidence group and then quietly stop being true: the group is renamed
    in a refactor, the prose still reads correctly, and the score keeps citing evidence that no
    longer exists. <code>srsInputContract.test.ts</code> parses both the contract and the M16
    registry and fails when an input loses its group.</p>
  <p><strong>Proved against the real registry, not only a fixture.</strong> ${esc(D.MUTATION.what)}
    and ${esc(D.MUTATION.result)}; ${esc(D.MUTATION.restore)}. ${D.MUTATION.synthetic} further
    synthetic cases prove each parsing rule can fail, each with a control proving the check has
    not simply started refusing everything. ${D.MUTATION.total} tests in total.</p>
  <div class="note">
    <strong>One of those tests exists because this document was wrong first.</strong> Part 7
    originally opened "Eight of the thirteen inputs are safe" while the table below it held
    ${D.COUNTS.safe}. Nothing caught it: the verdict check passed, every citation passed, and the
    prose read perfectly. The binding test now compares the headline sentence to a tally of the
    table, because the number is the part people quote.
  </div>

  <h2>4. What stands between here and yes</h2>
  <table><thead><tr><th>#</th><th>What</th><th>Whose</th><th>Size</th></tr></thead>
    <tbody>${toYes}</tbody></table>
  <p>Items 1 to 3 are code and this is a document ticket, so under the scope-lock rule they are
    logged as the proposal M24 produces rather than folded into it.</p>

  <h2>5. Entry-gate tickets that still bear on this</h2>
  <table><thead><tr><th>Ticket</th><th>State</th><th>What it changes here</th></tr></thead>
    <tbody>${blockers}</tbody></table>

  <h2>6. What may proceed now</h2>
  <p>${esc(D.PROCEEDS)}</p>

  <h2>7. What this does NOT establish</h2>
  <ul>${notEstablished}</ul>

  <div class="footer">${esc(D.CODE)} &middot; document &middot; figures from one data module
    &middot; ${esc(D.MEASURED_ON)}</div>`;

  return { css, body, title: `${D.CODE} SRS input contract` };
}

module.exports = { buildVisual, buildDocument };
