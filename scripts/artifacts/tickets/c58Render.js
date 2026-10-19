/**
 * C5.8's two deliverables: the one-page visual and the document.
 *
 * Both lead on the claim the page must not make rather than on the copy, because that is
 * the part of this ticket that could have gone wrong quietly.
 */
const D = require('./c58Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.2pt;
       font-weight:700; color:#fff; white-space:nowrap; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .route { font-family:Consolas,monospace; font-size:8.2pt; background:var(--bg-alt);
           border:1px solid var(--border); border-radius:4px; padding:6px 9px;
           margin:4px 0 8px; white-space:pre-wrap; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
`;

const chip = (k) => `<span class="k" style="background:${k.color}">${esc(k.k)}</span>`;

function criteriaTable(full) {
  return `<table>
    <tr><th style="width:${full ? '30%' : '60%'}">Acceptance criterion</th>
      ${full ? '<th>Evidence</th>' : ''}<th style="width:${full ? '11%' : '20%'}">Kind</th></tr>
    ${D.criteria().map((r) => `<tr>
      <td><b>${esc(r.c)}</b></td>
      ${full ? `<td>${esc(r.e)}</td>` : ''}
      <td>${chip(r.kind)}</td></tr>`).join('')}
  </table>`;
}

function doorsTable() {
  return `<table>
    <tr><th style="width:42%">C5.1 door</th><th>State</th></tr>
    ${D.READY.map((s) => `<tr><td><b>${esc(s)}</b></td><td>live</td></tr>`).join('')}
    ${D.UNREADY.map((s) => `<tr><td><b>${esc(s)}</b></td>
      <td>not routed, and still needs a ticket in group 05</td></tr>`).join('')}
  </table>`;
}

function claimTable() {
  return `<table>
    <tr><th style="width:24%">Registry key</th><th style="width:18%">State</th>
      <th>What the page does with it</th></tr>
    <tr><td><code>${esc(D.PARTNER.key)}</code></td><td><b>${esc(D.PARTNER.verification)}</b></td>
      <td>Never used. No contract, badge asset or authorization was located for it.</td></tr>
    <tr><td><code>${esc(D.CAPABILITY.key)}</code></td><td>${esc(D.CAPABILITY.verification)}</td>
      <td>Used verbatim: &ldquo;${esc(D.CAPABILITY.wording)}&rdquo;</td></tr>
    <tr><td><code>${esc(D.POSITIONING.key)}</code></td><td>${esc(D.POSITIONING.verification)}</td>
      <td>Rendered by the shared template on every segment page.</td></tr>
  </table>`;
}

function buildVisual() {
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.8pt; }
    h1 { font-size:15pt; }
    h2 { font-size:10pt; margin:8px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 8px; }
    .takeaway .headline { font-size:9.8pt; }
    table { font-size:7.8pt; margin:2px 0 6px; }
    td, th { padding:3px 6px; }
    .cols { display:flex; gap:12px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:5px 0; font-size:8pt; }
    .route { font-size:7.4pt; padding:5px 7px; }
    .dec { padding:7px 10px; }`;

  const body = `<div>
    <h1>C5.8 &middot; Strategic AI Ecosystem Partners Page</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; route <b>${esc(D.ROUTE)}</b> &middot;
      PR ${D.PR_NUM}, open and unmerged &middot; four of five C5.1 doors now live</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>Acceptance criteria</h2>
        ${criteriaTable(false)}
        <h2>Routed, proven through the generator</h2>
        <div class="route">${esc(D.GENERATOR)}</div>
        <div class="meta">Inside the PublicLayoutV2 block, segment marked ready, and the
          slug collides with none of the ${D.LITERAL.size} literal paths. All three read
          from the real files when this PDF was built.</div>
      </div>
      <div class="col">
        <h2>The claim this page must not make</h2>
        ${claimTable()}
        <div class="note warn"><b>A page about partnering is exactly where a partnership
          claim reappears.</b> The registry marks it DO_NOT_PUBLISH for want of any
          evidence, so a new test asserts no segment claims a lab partnership, an official
          partnership, or having partnered with a lab.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C5.8 - Strategic AI Ecosystem Partners Page', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }`;

  const body = `<div class="wrap">
    <h1>C5.8 &middot; Strategic AI Ecosystem Partners Page</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; route ${esc(D.ROUTE)} &middot;
      <a href="${esc(D.BC)}">ticket C5.8</a> &middot;
      <a href="${esc(D.PR)}">PR ${D.PR_NUM}</a></div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Build the partner route as a real, routed, deployed
      page consistent with the locked positioning. Partner conversations need a page that
      speaks to partners, not customers.
      <br><br>
      <b>What was delivered.</b> A routed page at ${esc(D.ROUTE)} that answers the
      partner’s first question before describing our capability, and that names what we
      build with using the only registry wording approved for it.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>Acceptance criteria, with the evidence for each</h2>
    ${criteriaTable(true)}

    <h2>How this page is routed</h2>
    <div class="route">${esc(D.GENERATOR)}</div>
    <p>Segment routes are generated rather than written one per line, so the proof is a
    chain of three and this document walked all of it: the segment carries
    <code>ready: true</code>, the generator still runs inside the
    <code>PublicLayoutV2</code> block, and the slug collides with none of the
    ${D.LITERAL.size} paths App.tsx declares literally. Break any link and this PDF fails
    to build.</p>

    <h2>Every claim, and the one that is refused</h2>
    ${claimTable()}

    <h2>The five doors</h2>
    ${doorsTable()}

    <div class="pagebreak"></div>
    <h2>Website artifact manifest</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Value</th></tr>
      ${D.MANIFEST.map((r) => `<tr><td><b>${esc(r[0])}</b></td>
        <td style="word-break:break-word">${esc(r[1])}</td></tr>`).join('')}
    </table>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:6px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C5.8 - Strategic AI Ecosystem Partners Page', css, body });
}

module.exports = { buildVisual, buildDocument };
