/**
 * C5.5 and C5.6 - the one-page visual and the document, parameterised by ticket.
 *
 * One render module because the two pages shipped as one change: the same template, the
 * same guards, two content blocks and a boolean. Where they genuinely differ is the
 * argument each page makes, and that is the part the PDFs lead with.
 */
const D = require('./c55c56Data');
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

function criteriaTable(id, full) {
  return `<table>
    <tr><th style="width:${full ? '30%' : '60%'}">Acceptance criterion</th>
      ${full ? '<th>Evidence</th>' : ''}<th style="width:${full ? '11%' : '20%'}">Kind</th></tr>
    ${D.criteria(id).map((r) => `<tr>
      <td><b>${esc(r.c)}</b></td>
      ${full ? `<td>${esc(r.e)}</td>` : ''}
      <td>${chip(r.kind)}</td></tr>`).join('')}
  </table>`;
}

function argumentTable() {
  return `<table>
    <tr><th style="width:26%">Segment</th><th style="width:24%">Category noun</th>
      <th>Who actually checks the proof</th></tr>
    <tr><td><b>Higher education</b></td><td>AI readiness</td>
      <td>a dean asked to evidence outcomes</td></tr>
    <tr><td><b>Enterprise</b> &middot; C5.5</td><td>${esc(D.TICKETS.c55.noun)}</td>
      <td>${esc(D.TICKETS.c55.checks)}</td></tr>
    <tr><td><b>Workforce</b> &middot; C5.6</td><td>${esc(D.TICKETS.c56.noun)}</td>
      <td>${esc(D.TICKETS.c56.checks)}</td></tr>
  </table>`;
}

function manifestTable(id) {
  return `<table>
    <tr><th style="width:22%">Field</th><th>Value</th></tr>
    ${D.MANIFEST(id).map((r) => `<tr><td><b>${esc(r[0])}</b></td>
      <td style="word-break:break-word">${esc(r[1])}</td></tr>`).join('')}
  </table>`;
}

/* ------------------------------------------------------------------ *
 * One page
 * ------------------------------------------------------------------ */

function buildVisual(id) {
  const t = D.TICKETS[id];
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
    <h1>${esc(t.id)} &middot; ${esc(t.title)}</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; route <b>${esc(t.route)}</b> &middot;
      PR ${D.PR_NUM}, open and unmerged &middot; four of five acceptance criteria met now</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>Acceptance criteria</h2>
        ${criteriaTable(id, false)}
        <h2>Routed, proven through the generator</h2>
        <div class="route">${esc(D.GENERATOR)}</div>
        <div class="meta">Inside the PublicLayoutV2 block. The segment carries
          <b>ready: true</b>, so the route exists; and the slug collides with none of the
          ${D.LITERAL.size} paths App.tsx declares literally, so it shadows nothing. All
          three links were read from the real files when this PDF was built.</div>
      </div>
      <div class="col">
        <h2>Each segment argues differently</h2>
        ${argumentTable()}
        <div class="note"><b>Sharing a template is what stops three different arguments.</b>
          It is not permission to ship the same page three times, so a test asserts the
          ledes, proof bands, calls to action and headings are all distinct.</div>
        <div class="note warn"><b>No price on either page.</b> C2.3 approved $150 a learner
          and an entry block of 60 learners at $9,000. That sits inside what a public buyer
          can spend with no competition and no board vote, which makes it the strongest
          single fact available to the workforce page, and it has no registry row.</div>
      </div>
    </div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: `${t.id} - ${t.title}`, css, body });
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

function buildDocument(id) {
  const t = D.TICKETS[id];
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }`;

  const body = `<div class="wrap">
    <h1>${esc(t.id)} &middot; ${esc(t.title)}</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; route ${esc(t.route)} &middot;
      <a href="${esc(t.bc)}">ticket ${esc(t.id)}</a> &middot;
      <a href="${esc(D.PR)}">PR ${D.PR_NUM}</a></div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> ${esc(t.asked)}
      <br><br>
      <b>What was delivered.</b> ${esc(t.delivered)}
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>Acceptance criteria, with the evidence for each</h2>
    ${criteriaTable(id, true)}

    <h2>How this page is routed</h2>
    <p>Segment routes are not written one per line. App.tsx maps the ready segments to
    routes inside the <code>PublicLayoutV2</code> block:</p>
    <div class="route">${esc(D.GENERATOR)}</div>
    <p>So the proof is a chain of three links rather than a single grep, and this document
    walked all three when it was built: <b>${esc(t.slug)}</b> carries <code>ready: true</code>
    in v2Segments.ts; App.tsx still generates routes from <code>readySegments()</code> inside
    the layout block; and the slug collides with none of the ${D.LITERAL.size} paths App.tsx
    declares literally. Break any link and this PDF fails to build.</p>

    <h2>Each segment argues differently</h2>
    ${argumentTable()}
    <p>The only claim rendered on the page is
    <code>${esc(D.POSITIONING.key)}</code>, through the registry:
    &ldquo;${esc(D.POSITIONING.wording)}&rdquo;. Everything else is claim-free prose that
    describes what the page offers and states no figure, which a build assertion checks by
    reading the segment source for a currency amount or a percentage.</p>

    <div class="pagebreak"></div>
    <h2>Website artifact manifest</h2>
    ${manifestTable(id)}

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:6px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: `${t.id} - ${t.title}`, css, body });
}

module.exports = { buildVisual, buildDocument };
