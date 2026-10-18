/**
 * C7.3's two deliverables: the one-page clause map, and the SOW structure.
 *
 * The disclaimer is rendered first in the body of both, because the assertion that checks
 * its prominence measures where it actually lands in the output.
 */
const D = require('./c73Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .st { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.2pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .cl { border:1px solid var(--border); border-radius:6px; padding:8px 11px; margin:0 0 7px; }
  .cl.ali { border-left:4px solid #b26a00; background:#fffaf2; }
  .cl.counsel { border-left:4px solid #b3261e; background:#fdf7f6; }
  .cl.drafted { border-left:4px solid #1f6feb; }
  .cl .hd { font-weight:700; }
  .cl .dr { margin-top:4px; }
  .cl .nt { font-size:8.6pt; color:var(--ink); margin-top:4px; }
  .disc { border:2px solid #b3261e; background:#fdf3f2; border-radius:7px;
          padding:10px 14px; margin:0 0 12px; font-weight:700; }
`;

const chip = (s) => `<span class="st" style="background:${s.color}">${esc(s.k)}</span>`;
const cls = (s) => (s === D.STATE.ALI ? 'ali' : s === D.STATE.COUNSEL ? 'counsel' : 'drafted');

function clauseCards(short) {
  return D.CLAUSES.map((c) => `<div class="cl ${cls(c.state)}">
    <div class="hd">${c.n}. ${esc(c.name)} ${chip(c.state)}</div>
    <div class="dr">${esc(c.draft)}</div>
    ${short ? '' : `<div class="nt">${esc(c.note)}</div>`}
  </div>`).join('');
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
    .takeaway { padding:9px 12px; margin:0 0 8px; }
    .takeaway .headline { font-size:10.5pt; }
    .disc { padding:7px 11px; margin:0 0 8px; font-size:8.6pt; }
    table { font-size:8pt; margin:3px 0 6px; }
    td, th { padding:3px 6px; }`;

  const counts = D.CLAUSES.reduce((a, c) => { a[c.state.k] = (a[c.state.k] || 0) + 1; return a; }, {});

  const body = `<div class="wrap">
    <h1>C7.3 &middot; Pilot SOW Structure</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; twelve clauses &middot; none reviewed by a lawyer</div>
    <div class="rule"></div>

    <div class="disc">${esc(D.DISCLAIMER)}</div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The twelve clauses</h2>
        <table>
          <tr><th style="width:8%">#</th><th style="width:44%">Clause</th><th>State</th></tr>
          ${D.CLAUSES.map((c) => `<tr><td>${c.n}</td><td><b>${esc(c.name)}</b></td>
            <td>${chip(c.state)}</td></tr>`).join('')}
        </table>
        <div class="meta">${Object.entries(counts).map(([k, v]) => {
    // Lowercasing the whole label turned "ALI DECISION REQUIRED" into "ali decision
    // required", which reads as a typo of somebody's name.
    const label = k.toLowerCase().replace(/ali/g, 'Ali');
    return `${v} ${label}`;
  }).join(' &middot; ')}</div>
      </div>
      <div class="col">
        <h2>The one that could void the deal</h2>
        <div class="note warn" style="padding:7px 10px">A Texas state consulting contract
          expected to exceed <b>$15,000</b> requires a finding of fact from the Legislative
          Budget Board before signature, and Government Code 2254.029 says a contract entered
          into without one is <b>void</b>. The pilot is <b>$44,500</b>. We would deliver the
          work before finding out. The classification is the agency&rsquo;s to make, which is
          why it is a question for the first meeting rather than a clause for counsel later.</div>

        <h2>Three clauses you have to decide</h2>
        <div class="note" style="padding:7px 10px">C2.6 reserves IP ownership, deployment
          liability and model neutrality to you. All three are left <b>deliberately
          blank</b>. A plausible IP clause is more dangerous than an empty one, because it
          might get signed. An assertion fails the build if any of them acquires draft
          language.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.3 - Pilot SOW Structure', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C7.3 &middot; Pilot SOW Structure</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C7.3 &middot; blocks C9.7</div>
    <div class="rule"></div>

    <div class="disc">${esc(D.DISCLAIMER)}</div>

    <div class="asked">
      <b>What the ticket asked for.</b> A contract-ready structure for legal review, with
      every clause needing counsel flagged, a prominent not-legal-advice disclaimer, and IP
      and data clauses present even if unresolved.
      <br><br>
      <b>What was delivered.</b> Twelve clauses with a review state each, three left
      deliberately blank because C2.6 reserves them to you, and one precondition that is not
      really a clause at all because it has to be asked before anybody drafts anything.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>The clauses</h2>
    ${clauseCards(false)}

    <h2>What you have to decide before counsel can finish</h2>
    <ol>${D.ALI_DECISIONS.map((d) => `<li style="margin-bottom:4px"><b>${esc(d)}</b></li>`).join('')}</ol>
    <div class="note warn">These three are left blank on purpose. Filling them with
    reasonable-sounding language would produce a document somebody could sign, which is the
    specific risk the ticket names.</div>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="note"><b>BLOCKED - ALI DECISION REQUIRED.</b> The ticket sets this review
    state itself, because the IP, liability and model-neutrality positions are yours and the
    document cannot go to counsel without them.</div>
  </div>`;

  return htmlDoc({ title: 'C7.3 - Pilot SOW Structure', css, body });
}

module.exports = { buildVisual, buildDocument };
