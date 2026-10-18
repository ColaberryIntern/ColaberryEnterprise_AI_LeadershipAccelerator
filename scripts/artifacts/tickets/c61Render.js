/**
 * C6.1's two deliverables: the one-page verdict table, and the design document.
 */
const D = require('./c61Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .vd { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.3pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .ent { border:1px solid var(--border); border-radius:6px; padding:8px 11px; margin:0 0 7px; }
  .ent .hd { font-weight:700; }
  .ent .lab { font-weight:700; font-size:8.3pt; margin-top:5px; }
  .ent .proof { font-size:8pt; color:var(--muted); font-style:italic; margin-top:4px; }
  code { font-size:8.6pt; }
`;

const chip = (v) => `<span class="vd" style="background:${v.color}">${esc(v.k)}</span>`;

function verdictTable() {
  return `<table>
    <tr><th style="width:6%">#</th><th style="width:26%">Entity</th>
      <th style="width:20%">Verdict</th><th>Where it lives</th></tr>
    ${D.ENTITIES.map((e) => `<tr><td>${e.n}</td><td><b>${esc(e.entity)}</b></td>
      <td>${chip(e.verdict)}</td><td><code>${esc(e.where)}</code></td></tr>`).join('')}
  </table>`;
}

function entityCards() {
  return D.ENTITIES.map((e) => `<div class="ent">
    <div class="hd">${e.n}. ${esc(e.entity)} ${chip(e.verdict)}
      &nbsp;<code>${esc(e.where)}</code></div>
    <div style="margin-top:3px">${esc(e.why)}</div>
    <div class="lab">What changes</div><div>${esc(e.change)}</div>
    <div class="proof">Measured: ${esc(e.proof)}</div>
  </div>`).join('');
}

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    /* No @page rule: renderArtifactPdf sets size and margin, and a CSS margin stacks with
       it. Overrides come after SHARED because equal specificity means last wins. */
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:9px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 9px; }
    .takeaway .headline { font-size:10.5pt; }
    table { font-size:8.2pt; margin:3px 0 7px; }
    td, th { padding:3px 6px; }`;

  const counts = D.ENTITIES.reduce((a, e) => {
    a[e.verdict.k] = (a[e.verdict.k] || 0) + 1; return a;
  }, {});

  const body = `<div class="wrap">
    <h1>C6.1 &middot; Strategic Account Data Model</h1>
    <div class="meta">Schema inspected against production ${esc(D.AS_OF)}
      &middot; design only, nothing built</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The verdict, per entity</h2>
        ${verdictTable()}
        <div class="meta">${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' &middot; ')}.
          One new table in the whole design, and it is a many-to-many that cannot be a
          column.</div>
      </div>

      <div class="col">
        <h2>Why no new account table</h2>
        <div class="note good" style="padding:7px 10px"><code>organizations</code> already
          has <b>name</b> NOT NULL, a <b>status</b>, a <b>nullable owner_enrollment_id</b> so
          an account with no enrolled owner is legal, a <b>nullable lead_id</b> already
          linking to the CRM, and an <b>organization_type</b> discriminator already carrying
          <code>enterprise_customer</code> and <code>client</code>. A strategic account is a
          new value in that column.</div>

        <h2>Why leads cannot be the account</h2>
        <div class="note warn" style="padding:7px 10px">24,791 rows and only <b>2,584 carry a
          company at all</b>. It is person-shaped, which is exactly what makes it the right
          home for decision makers. The missing piece is the join: <code>leads.company</code>
          is free text with no foreign key.</div>

        <h2>The trap</h2>
        <div class="note" style="padding:7px 10px"><b>${esc(D.TRAP.what)}</b>
          ${esc(D.TRAP.consequence)}</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C6.1 - Strategic Account Data Model', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C6.1 &middot; Strategic Account Data Model</h1>
    <div class="meta">Schema inspected against production ${esc(D.AS_OF)} &middot; Ticket C6.1
      &middot; blocks C6.2 and C8.3</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Decide how strategic accounts are stored, reusing
      existing models rather than creating a second CRM. A verdict of reuse, extend or build
      per entity, with no new table proposed without proving the existing one cannot carry
      it.
      <br><br>
      <b>What was delivered.</b> Ten entities with a verdict each, the schema inspected
      before anything was designed, and the rule taken literally enough that the answer is
      one new table rather than a new account model.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. The verdict at a glance</h2>
    ${verdictTable()}

    <h2>2. The trap worth naming first</h2>
    <div class="note warn"><b>${esc(D.TRAP.what)}</b><br><br>${esc(D.TRAP.detail)}</div>
    <p>${esc(D.TRAP.consequence)}</p>

    <div class="pagebreak"></div>
    <h2>3. Each entity, with the evidence</h2>
    ${entityCards()}

    <h2>4. Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="note"><b>One new table needs your approval</b>, under the ticket's own rule.
    Everything else is a type value, a nullable column or a json key on a table that already
    exists.</div>
  </div>`;

  return htmlDoc({ title: 'C6.1 - Strategic Account Data Model', css, body });
}

module.exports = { buildVisual, buildDocument };
