/**
 * C8.1's two PDFs: the one-page finding, and the architecture document.
 *
 * The HTML prototype is the third deliverable and lives in c81Prototype.js. Basecamp does
 * not preview HTML, so the prototype goes in the folder and these two PDFs go on the
 * ticket, which is the standing split.
 */
const D = require('./c81Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .st { display:inline-block; padding:1px 7px; border-radius:9px; font-size:6.9pt;
        font-weight:700; color:#fff; white-space:nowrap; }
  .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:11px 14px;
           margin:0 0 14px; border-radius:0 5px 5px 0; }
  .dec { border:2px solid var(--cherry); border-radius:6px; padding:9px 12px; margin:10px 0 0; }
  .dec .lab { font-size:7.6pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
              color:var(--cherry-deep); margin-bottom:3px; }
  .big { display:flex; gap:9px; margin:6px 0 9px; }
  .big div { flex:1; border:1px solid var(--border); border-radius:6px; padding:7px 10px; }
  .big .n { font-size:19pt; font-weight:700; line-height:1; }
  .big .k { font-size:7.2pt; color:var(--muted); text-transform:uppercase;
            letter-spacing:.05em; margin-top:3px; }
  .tcard { border:1px solid var(--border); border-left:4px solid var(--muted);
           border-radius:5px; padding:8px 11px; margin:0 0 7px; page-break-inside:avoid; }
  .tcard h3 { margin:0 0 3px; font-size:10pt; }
  .tcard .lab { font-size:7.2pt; font-weight:700; text-transform:uppercase;
                letter-spacing:.05em; color:var(--muted); margin-top:4px; }
  .mono { font-family:Consolas,monospace; font-size:8pt; }
`;

const chip = (s) => `<span class="st" style="background:${s.color}">${esc(s.k)}</span>`;

function tally() {
  const c = D.counts();
  return `<div class="big">
    <div><div class="n" style="color:#2f7d32">${c.live}</div><div class="k">live today</div></div>
    <div><div class="n" style="color:#b26a00">${c.proxy}</div><div class="k">proxy only</div></div>
    <div><div class="n" style="color:#b3261e">${c.none}</div><div class="k">not yet measurable</div></div>
    <div><div class="n">${D.PREREQS.length}</div><div class="k">schema additions needed</div></div>
  </div>`;
}

function tileTable() {
  return `<table>
    <tr><th style="width:24%">Required metric</th><th style="width:15%">State</th>
      <th>Data source, or why there is none</th></tr>
    ${D.TILES.map((t) => `<tr>
      <td><b>${esc(t.label)}</b>${t.value ? ` &middot; ${esc(t.value)}` : ''}</td>
      <td>${chip(t.status)}</td>
      <td>${esc(t.source)}</td></tr>`).join('')}
  </table>`;
}

function prereqTable() {
  return `<table>
    <tr><th style="width:26%">Schema addition</th><th>What it unlocks</th></tr>
    ${D.PREREQS.map((p) => `<tr><td><b>${esc(p[0])}</b></td>
      <td>${esc(p[1])}</td></tr>`).join('')}
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
    .note { padding:6px 9px; margin:5px 0; font-size:7.9pt; }
    .dec { padding:7px 10px; }`;

  const body = `<div>
    <h1>C8.1 &middot; Commercialization Command Center</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; UX and architecture &middot; every tile names
      its source &middot; measured against production, read-only</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>

    ${tally()}
    ${tileTable()}

    <div class="note warn"><b>Building C8.2 first would ship an empty dashboard.</b>
      C8.2 is due 20 October and builds this route. On today's data it would render eight
      tiles reading "not measured". The fix is not front-end work: it is the four schema
      additions in the document, which between them turn seven of the eight blanks into
      real numbers. A commercial opportunity record alone unlocks three.</div>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C8.1 - Commercialization Command Center', css, body });
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:920px; margin:0 auto; padding:28px 22px 56px; }`;

  const body = `<div class="wrap">
    <h1>C8.1 &middot; Commercialization Command Center: UX and Architecture</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C8.1 &middot; defines the admin route
      C8.2 will build &middot; HTML prototype filed alongside this document</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> Design the command center with ten required top
      metrics. Every tile must name the data source that will populate it, and any tile with
      no source is marked NOT YET MEASURABLE rather than mocked. Reuse the existing admin
      design system. The named risk is "designing for metrics we cannot populate".
      <br><br>
      <b>What was delivered.</b> All ten tiles designed and sourced against the real
      production schema, an HTML prototype using the actual design tokens from
      <code>frontend/src/styles/tokens.css</code>, the route and authorisation C8.2 should
      build, and the four schema additions that stand between this design and a board worth
      opening.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.headline())}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>The ten tiles</h2>
    ${tileTable()}

    <div class="pagebreak"></div>
    <h2>Each tile, with what would populate it</h2>
    ${D.TILES.map((t) => `<div class="tcard">
      <h3>${esc(t.label)} ${chip(t.status)}
        ${t.value ? `<span class="mono">${esc(t.value)}</span>` : ''}</h3>
      ${t.sub ? `<div class="meta">${esc(t.sub)}</div>` : ''}
      <div class="lab">Source</div><div class="mono">${esc(t.source)}</div>
      <div class="lab">What that means</div><div>${esc(t.caveat)}</div>
    </div>`).join('')}

    <h2>What has to exist before this board is worth building</h2>
    ${prereqTable()}

    <h2>Route and access</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Value</th></tr>
      <tr><td><b>Route</b></td><td class="mono">${esc(D.ROUTE.path)}</td></tr>
      <tr><td><b>Authorisation</b></td><td>${esc(D.ROUTE.auth)}</td></tr>
      <tr><td><b>Built by</b></td><td>${esc(D.ROUTE.note)}</td></tr>
    </table>

    <h2>Design system</h2>
    <p>The prototype declares the token names from
    <code>frontend/src/styles/tokens.css</code> and uses them throughout rather than
    inventing colours, so it can be lifted into the admin shell unchanged. A build assertion
    reads that stylesheet and fails if the prototype ever references a token the app does
    not define, which is how "reuses the existing admin design system" is checked rather
    than claimed.</p>

    <h2>Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>

    <div class="dec">
      <div class="lab">What needs your decision</div>
      ${esc(D.DECISION)}
    </div>
  </div>`;

  return htmlDoc({ title: 'C8.1 - Commercialization Command Center', css, body });
}

module.exports = { buildVisual, buildDocument };
