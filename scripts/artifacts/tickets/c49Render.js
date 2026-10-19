/**
 * C4.9's two deliverables: the one-page template at a glance, and the fillable template.
 *
 * The document IS the template. Each section prints its ask, its source and a blank slot,
 * so the monthly job is to fill it rather than to rebuild it.
 */
const D = require('./c49Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .au { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.2pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .sec { border:1px solid var(--border); border-radius:6px; padding:9px 12px; margin:0 0 8px; }
  .sec.out { border-left:4px solid #2f7d32; }
  .sec.other { border-left:4px solid var(--muted); }
  .sec .hd { font-weight:700; font-size:10.5pt; }
  .sec .lab { font-weight:700; font-size:8.2pt; margin-top:5px; color:var(--muted);
              text-transform:uppercase; letter-spacing:.04em; }
  .slot { border:1px dashed var(--border); border-radius:4px; background:var(--bg-alt);
          min-height:26px; margin-top:4px; padding:5px 8px; font-size:8.4pt;
          color:var(--muted); }
  .num { display:inline-block; border:2px solid var(--cherry); border-radius:5px;
         padding:3px 14px; font-size:8.4pt; color:var(--muted); margin-top:4px; }
`;

const chip = (a) => `<span class="au" style="background:${a.color}">${esc(a.k)}</span>`;

function sectionTable() {
  return `<table>
    <tr><th style="width:6%">#</th><th style="width:34%">Section</th>
      <th style="width:18%">Kind</th><th>Auto</th></tr>
    ${D.SECTIONS.map((s) => `<tr><td>${s.n}</td><td><b>${esc(s.name)}</b></td>
      <td>${esc(s.kind)}${s.headline ? ' &middot; headline number' : ''}</td>
      <td>${chip(s.auto)}</td></tr>`).join('')}
  </table>`;
}

function sectionCards() {
  return D.SECTIONS.map((s) => `<div class="sec ${s.kind === 'outcome' ? 'out' : 'other'}">
    <div class="hd">${s.n}. ${esc(s.name)} ${chip(s.auto)}</div>
    <div class="lab">What this section asks for</div>
    <div>${esc(s.asks)}</div>
    ${s.headline ? '<div class="num">headline number, with its as-of date</div>' : ''}
    <div class="slot">&nbsp;</div>
    <div class="lab">Source</div>
    <div class="meta" style="color:var(--ink)">${esc(s.source)}</div>
    <div class="lab">Note</div>
    <div class="meta" style="color:var(--ink)">${esc(s.note)}</div>
  </div>`).join('');
}

function budgetTable() {
  const total = D.HOUR_BUDGET.reduce((a, b) => a + b.mins, 0);
  return `<table>
    <tr><th>Part</th><th style="width:16%">Minutes</th></tr>
    ${D.HOUR_BUDGET.map((b) => `<tr><td>${esc(b.part)}</td><td>${b.mins}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td><b>${total}</b></td></tr>
  </table>`;
}

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { padding:0; }
    h1 { font-size:16pt; }
    h2 { font-size:10.5pt; margin:9px 0 5px; }
    body { font-size:9pt; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .takeaway { padding:9px 12px; margin:0 0 9px; }
    .takeaway .headline { font-size:10.5pt; }
    table { font-size:8.2pt; margin:3px 0 6px; }
    td, th { padding:3px 6px; }`;

  const body = `<div class="wrap">
    <h1>C4.9 &middot; Ram Monthly Board Pack Template</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; nine fixed sections &middot;
      outcomes first by construction</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The fixed section set</h2>
        ${sectionTable()}
        <div class="meta">A build assertion fails if an activity section is ever ordered
          above an outcome section, or if a non-outcome section claims a headline number.</div>
      </div>
      <div class="col">
        <h2>The hour, accounted for</h2>
        ${budgetTable()}
        <div class="note warn" style="padding:7px 10px"><b>Every AUTO mark means the data has
          a home and a query, not that a button exists.</b> C8.2, the command center that
          would make these genuinely automatic, is due 20 October and is not built. Four
          sections are marked MANUAL with the reason, because a template that promises
          automation it cannot deliver costs an hour a month forever.</div>
        <div class="note" style="padding:7px 10px"><b>Why activity is section 6.</b> The
          ticket names the failure mode as a template that invites filling with activity
          rather than outcomes. Order is the defense: revenue, pipeline, pilots and proof
          come first and are the only sections with a number slot.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C4.9 - Ram Monthly Board Pack Template', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C4.9 &middot; Ram Monthly Commercialization Board Pack</h1>
    <div class="meta">Template, ${esc(D.AS_OF)} &middot; Ticket C4.9 &middot;
      blocks C9.9, C9.10 and C9.11</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Make the Ram update repeatable so it takes an hour a
      month rather than a week: a reusable template with fixed sections and placeholders,
      outcome metrics leading, and a note on which sections C8.x can auto-populate.
      <br><br>
      <b>What was delivered.</b> Nine fixed sections with the outcome-first order enforced by
      a build assertion rather than by good intentions, a source named for every number, an
      honest auto-population mark per section, and the hour budgeted part by part.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>At a glance</h2>
    ${sectionTable()}

    <h2>The hour, accounted for</h2>
    ${budgetTable()}

    <div class="pagebreak"></div>
    <h2>The template</h2>
    <p>Fill the dashed slot under each section. The source line tells you where the number
    comes from; CLM-029 means a figure without one does not go out.</p>
    ${sectionCards()}

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="note"><b>What needs your decision:</b> the metric set you want to see every
    month. The nine sections above are a proposal, and the three outcome sections are the
    ones worth arguing about, because they are what the pack leads with.</div>
  </div>`;

  return htmlDoc({ title: 'C4.9 - Ram Monthly Board Pack Template', css, body });
}

module.exports = { buildVisual, buildDocument };
