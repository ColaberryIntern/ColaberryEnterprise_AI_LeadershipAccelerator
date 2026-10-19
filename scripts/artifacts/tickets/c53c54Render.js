/**
 * C5.3 and C5.4 - the one-page visual and the document, parameterized by ticket.
 *
 * One render module rather than two near-identical ones: the two pages were built together,
 * share a config and a stylesheet, and differ in four fields. Where they genuinely diverge
 * is the duration finding, which belongs to C5.4, and that is the one conditional here.
 */
const D = require('./c53c54Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .k { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.2pt;
       font-weight:700; color:#fff; white-space:nowrap; }
  .by { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.2pt;
        font-weight:700; border:1px solid currentColor; white-space:nowrap; }
  .by.platform { color:#2f7d32; }
  .by.people { color:#718096; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .route { font-family:Consolas,monospace; font-size:8.4pt; background:var(--bg-alt);
           border:1px solid var(--border); border-radius:4px; padding:6px 9px; margin:4px 0 8px;
           word-break:break-all; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0;
         background:#fff; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
`;

const chip = (k) => `<span class="k" style="background:${k.color}">${esc(k.k)}</span>`;

const stageRows = () => D.STAGES.map((s, i) => `<tr>
    <td style="width:7%">${i + 1}</td>
    <td><b>${esc(s.name)}</b></td>
    <td style="width:38%"><span class="by ${s.delivery}">${
  s.delivery === 'platform' ? 'the platform does this' : 'our team does this'
}</span></td>
  </tr>`).join('');

function criteriaTable(id, full) {
  return `<table>
    <tr><th style="width:${full ? '31%' : '62%'}">Acceptance criterion</th>
      ${full ? '<th>Evidence</th>' : ''}<th style="width:${full ? '11%' : '20%'}">Kind</th></tr>
    ${D.criteria(id).map((r) => `<tr>
      <td><b>${esc(r.c)}</b></td>
      ${full ? `<td>${esc(r.e)}</td>` : ''}
      <td>${chip(r.kind)}</td></tr>`).join('')}
  </table>`;
}

function registryTable() {
  return `<table>
    <tr><th style="width:26%">Registry key</th><th>Public wording, quoted</th>
      <th style="width:16%">State</th></tr>
    ${Object.values(D.CLAIMS).map((c) => `<tr><td><code>${esc(c.key)}</code></td>
      <td>${esc(c.wording)}</td><td>${esc(c.verification)}</td></tr>`).join('')}
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
 * The one-page visual
 * ------------------------------------------------------------------ */

function buildVisual(id) {
  const t = D.TICKETS[id];
  const r = D.ROUTES[id];
  const isAccel = id === 'c54';

  // NOTE: no `@page` rule here. The renderer emits Letter and sets its own margin; a CSS
  // page rule conflicts with the first and STACKS with the second, which is what forced a
  // second page on three earlier one-pagers. Overrides come after baseCss so they win.
  const css = `${baseCss()}
    ${SHARED}
    body { font-size:8.8pt; }
    h1 { font-size:15pt; }
    h2 { font-size:10pt; margin:8px 0 4px; }
    .takeaway { padding:8px 11px; margin:0 0 8px; }
    .takeaway .headline { font-size:10pt; }
    table { font-size:7.8pt; margin:2px 0 6px; }
    td, th { padding:3px 6px; }
    .cols { display:flex; gap:13px; align-items:flex-start; }
    .col { flex:1; }
    .note { padding:6px 9px; margin:6px 0; font-size:8pt; }
    .route { font-size:7.6pt; padding:5px 7px; }
    .dec { padding:7px 10px; }
    .cards { gap:8px; margin:4px 0 8px; }
    .card { padding:7px 9px; }
    .card .k { display:block; background:none; color:var(--cherry-deep); padding:0;
               font-size:8.4pt; margin-bottom:2px; }`;

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
        <h2>Routed, proven from the route tree</h2>
        <div class="route">App.tsx:${r.line} &nbsp; ${esc(r.decl)}</div>
        <div class="meta">Inside the PublicLayoutV2 block opened at line ${r.layoutLine}.
          Read out of App.tsx when this PDF was built, and asserted by a test that reads the
          same file. A page under pages/ that nobody mounted renders perfectly and is
          unreachable to a visitor, which is the failure both tickets name.</div>
      </div>
      <div class="col">
        <h2>The five stages, and who delivers each</h2>
        <table>${stageRows()}</table>
        ${isAccel ? `<div class="note warn"><b>Ninety days has no source.</b> The only
          verified duration in the registry is <code>program.duration</code>, public wording
          "${esc(D.CLAIMS.duration.wording)}", which is eighty-four days. CLM-029 says a
          figure without a row does not go out, so the page states the registry's duration
          and a test asserts no other one appears.</div>`
    : `<div class="note"><b>Two of the five are delivered by people.</b> The C2.2 audit
          found no platform capability for deployment candidate selection or for the
          executive impact report. The page labels each stage in text rather than in color,
          so the distinction survives grayscale and a printed page.</div>`}
      </div>
    </div>

    <h2>What is deliberately NOT on the page</h2>
    <div class="cards">
      <div class="card">
        <div class="k">No unsourced duration</div>
        <div>The registry verifies "${esc(D.CLAIMS.duration.wording)}" and nothing else.
          A test asserts no other duration appears.</div>
      </div>
      <div class="card">
        <div class="k">No Demo Day</div>
        <div>C2.2 says it has schema but has never been run end to end, and must not be
          described to a customer as proven. A test looks for it.</div>
      </div>
      <div class="card">
        <div class="k">No price</div>
        <div>C2.3's numbers are approved internally but have no registry row, and the
          registry is the gate for anything externally visible.</div>
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
  const r = D.ROUTES[id];

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

    <h2>The route, read out of App.tsx</h2>
    <div class="route">App.tsx:${r.line} &nbsp; ${esc(r.decl)}</div>
    <p>The declaration sits inside the <code>PublicLayoutV2</code> block opened at line
    ${r.layoutLine}, so the page inherits the site nav and footer rather than rendering
    bare. Both facts were read from the file when this PDF was built: if the route is
    deleted or moved out of the layout, the build of this document fails and no PDF is
    produced. A test asserts the same two things against the same file.</p>

    <h2>The five stages, and who delivers each</h2>
    <table>
      <tr><th style="width:7%">#</th><th style="width:20%">Stage</th><th>Delivered by</th></tr>
      ${stageRows()}
    </table>
    <p>These are read from <code>frontend/src/config/v2Journey.ts</code>, the same module the
    page renders, so this table cannot drift from the page. The C2.2 capability audit found
    deployment candidate selection has no platform capability at all and the executive impact
    report has no generator; both sit at day eighty to ninety, which is where a sponsor
    decides whether to run the program again. The label is rendered as text rather than as
    a color, so it survives grayscale, a color-blind reader and a printed page.</p>

    <h2>Every claim on the page, quoted from the registry</h2>
    ${registryTable()}
    <p>Both resolve through the <code>&lt;Claim&gt;</code> component, which returns nothing
    for a key that may not ship, so an unverified string cannot reach the page by being typed
    into it. One consequence worth stating: a test that only asserts a wrong figure is absent
    would also pass on a page that rendered nothing at all, so the suite asserts the registry
    wording IS present as well.</p>

    <div class="pagebreak"></div>
    <h2>Website artifact manifest</h2>
    ${manifestTable(id)}

    <h2>Files changed</h2>
    <table>
      <tr><th style="width:52%">File</th><th>What it is</th></tr>
      ${t.files.map((f) => `<tr><td><code>${esc(f[0])}</code></td>
        <td>${esc(f[1])}</td></tr>`).join('')}
    </table>

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
