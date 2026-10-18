/**
 * C7.7's two deliverables: the one-page posture summary, and the full gap report.
 *
 * The one-pager is what gets shown in a room, so it leads with the severity counts and the
 * two critical items, and it carries the SOC 2 wording exposure because that is the item
 * most likely to be acted on this week.
 */
const D = require('./c77Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .sv { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .ef { display:inline-block; width:15px; text-align:center; font-weight:700; font-size:8pt;
        border:1px solid var(--border); border-radius:3px; }
  .dom { font-family:Consolas,monospace; font-size:7.6pt; color:var(--muted); }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .gap { border:1px solid var(--border); border-left:4px solid var(--muted);
         border-radius:5px; padding:9px 11px; margin:0 0 8px; page-break-inside:avoid; }
  .gap.critical { border-left-color:#b3261e; }
  .gap.high { border-left-color:#c2410c; }
  .gap.medium { border-left-color:#b26a00; }
  .gap h3 { margin:0 0 4px; font-size:10.5pt; }
  .gap .lab { font-size:7.4pt; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
              color:var(--muted); margin-top:5px; }
  .big { display:flex; gap:9px; margin:6px 0 9px; }
  .big div { flex:1; border:1px solid var(--border); border-radius:6px; padding:7px 10px; }
  .big .n { font-size:18pt; font-weight:700; line-height:1; }
  .big .k { font-size:7.2pt; color:var(--muted); text-transform:uppercase;
            letter-spacing:.05em; margin-top:3px; }
  .quote { font-style:italic; }
`;

const sv = (s) => `<span class="sv" style="background:${s.color}">${esc(s.k)}</span>`;

function tally() {
  const c = D.counts();
  return `<div class="big">
    <div><div class="n" style="color:#b3261e">${c.critical}</div><div class="k">critical</div></div>
    <div><div class="n" style="color:#c2410c">${c.high}</div><div class="k">high</div></div>
    <div><div class="n" style="color:#b26a00">${c.medium}</div><div class="k">medium</div></div>
    <div><div class="n" style="color:#2f7d32">${D.STRENGTHS.length}</div><div class="k">controls in place</div></div>
    <div><div class="n">0</div><div class="k">certifications held</div></div>
  </div>`;
}

function gapTable(only) {
  const rows = only ? D.GAPS.filter((g) => only.includes(g.sev)) : D.GAPS;
  return `<table>
    <tr><th style="width:5%">#</th><th style="width:7%">CCM</th><th>Gap</th>
      <th style="width:11%">Severity</th><th style="width:7%">Effort</th></tr>
    ${rows.map((g) => `<tr>
      <td>${esc(g.id)}</td><td class="dom">${esc(g.domain)}</td>
      <td>${esc(g.gap)}</td><td>${sv(g.sev)}</td>
      <td><span class="ef">${esc(g.effort)}</span></td></tr>`).join('')}
  </table>`;
}

function certTable() {
  return `<table>
    <tr><th style="width:26%">Certification</th><th>Our position, stated plainly</th></tr>
    ${D.CERTS.map((c) => `<tr><td><b>${esc(c[0])}</b></td><td>${esc(c[1])}</td></tr>`).join('')}
  </table>`;
}

function claimTable() {
  return `<table>
    <tr><th style="width:40%">Where</th><th>What it says today</th></tr>
    ${D.CLAIM_EXPOSURE.map((c) => `<tr><td><code>${esc(c[0])}</code></td>
      <td class="quote">${esc(c[1])}</td></tr>`).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page
 * ------------------------------------------------------------------ */

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.6pt; }
    h1 { font-size:15pt; }
    h2 { font-size:9.8pt; margin:7px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 7px; }
    .takeaway .headline { font-size:9.6pt; }
    table { font-size:7.6pt; margin:2px 0 5px; }
    td, th { padding:3px 5px; }
    .cols { display:flex; gap:12px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:5px 0; font-size:7.9pt; }
    .dec { padding:7px 10px; }
    .big { margin:5px 0 7px; }`;

  const body = `<div>
    <h1>C7.7 &middot; Enterprise Security &amp; Trust Readiness</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; mapped to CSA Cloud Controls Matrix v4.1
      &middot; evidenced from code and from production, not assumed</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    ${tally()}

    <div class="cols">
      <div class="col">
        <h2>Critical and high</h2>
        ${gapTable([D.SEV.CRITICAL, D.SEV.HIGH])}
        <div class="meta">Effort: S under a week, M one to four weeks, L over a month.</div>
      </div>
      <div class="col">
        <h2>Certifications</h2>
        ${certTable()}
        <div class="note warn"><b>We already claim more than we hold.</b> Two routed
          marketing pages describe SOC 2 aligned audit trails, and one says
          "auditor-ready from day one". We hold no SOC 2 report and none is in progress.
          Our own internal trust rubric also scores a CORS allow-list the code does not
          have. These are claims rather than gaps, and they are live now.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.7 - Enterprise Security and Trust Readiness', css, body });
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:940px; margin:0 auto; padding:28px 22px 56px; }`;

  const body = `<div class="wrap">
    <h1>C7.7 &middot; Enterprise Security &amp; Trust Readiness Gap Assessment</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C7.7 &middot; INTERNAL. This document
      lists our weaknesses with file references and is not for distribution outside
      Colaberry.</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Establish honestly what the platform can and cannot
      answer in an enterprise security review. Assess SSO, RBAC and ABAC, audit logging, data
      isolation, privacy, retention, incident response, backups, vendor and model data
      handling, overall posture and SOC 2 readiness. For each: current state from code or
      production evidence, the gap, severity, and effort to close. Never claim a
      certification not held. Produce the honest list including the uncomfortable items.
      <br><br>
      <b>What was delivered.</b> ${D.GAPS.length} gaps mapped to the CSA Cloud Controls
      Matrix v4.1 domains, each with a severity, an effort estimate and either a file
      reference or a dated production measurement; ${D.STRENGTHS.length} controls that are
      genuinely in place; a plain statement that we hold no certifications; and the two
      places where our own words already claim more than we hold.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>All ${D.GAPS.length} gaps at a glance</h2>
    ${gapTable(null)}

    <h2>Certifications, stated plainly</h2>
    ${certTable()}

    <h2>Where we already claim more than we hold</h2>
    <p>The ticket names this as the way the work becomes untrustworthy, so it is reported
    first among the uncomfortable items. Each of these is routed and reachable today.</p>
    ${claimTable()}
    <p>Separately, <code>backend/src/services/trustRubric.ts:256</code> scores transport
    hardening as shipped on the strength of "helmet, cors allow-list, and rate limiting
    present". There is no CORS allow-list. An internal scorecard that overstates a control
    is how an overstatement reaches a customer document.</p>

    <div class="pagebreak"></div>
    <h2>Each gap in full</h2>
    ${D.GAPS.map((g) => `<div class="gap ${g.sev.k.toLowerCase()}">
      <h3>${esc(g.id)}. ${esc(g.gap)} ${sv(g.sev)}
        <span class="dom">${esc(g.domain)} &middot; ${esc(D.DOMAIN[g.domain])} &middot;
        effort ${esc(g.effort)}</span></h3>
      <div class="lab">Current state</div><div>${esc(g.state)}</div>
      <div class="lab">Evidence</div><div class="meta" style="color:var(--ink)">${esc(g.evidence)}</div>
      <div class="lab">What this means in a review</div><div>${esc(g.answer)}</div>
    </div>`).join('')}

    <div class="pagebreak"></div>
    <h2>What is genuinely in place</h2>
    <p>A report that lists only gaps is as misleading as one that lists none, and a buyer who
    is told everything is broken will not believe the parts that are fine. A build assertion
    fails if this section falls below five entries.</p>
    ${D.STRENGTHS.map((s) => `<div class="gap" style="border-left-color:#2f7d32">
      <h3>${esc(s[0])}</h3><div>${esc(s[1])}</div>
    </div>`).join('')}

    <h2>Limits of this assessment</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.7 - Enterprise Security and Trust Readiness', css, body });
}

module.exports = { buildVisual, buildDocument };
