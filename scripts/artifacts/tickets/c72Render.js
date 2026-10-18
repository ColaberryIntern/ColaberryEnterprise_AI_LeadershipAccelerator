/**
 * C7.2's two deliverables: the one-page summary, and the proposal template itself.
 */
const D = require('./c72Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .var { font-family:Consolas, monospace; font-weight:700; color:var(--cherry);
         background:var(--cherry-bg); padding:1px 5px; border-radius:4px; font-size:8.6pt; }
  .xc { border:1px solid #f3c9c6; background:#fdf3f2; border-left:4px solid #b3261e;
        border-radius:0 6px 6px 0; padding:7px 10px; margin:0 0 6px; }
  .xc .src { font-size:7.8pt; color:var(--muted); font-style:italic; }
  .price { border:2px solid var(--cherry); border-radius:7px; padding:10px 14px;
           margin:8px 0 10px; }
  .price .n { font-size:24pt; font-weight:700; color:var(--cherry); line-height:1; }
`;

function exclusionCards(short) {
  return D.EXCLUSIONS.map((e) => `<div class="xc">
    <b>${esc(e.x)}</b>
    ${short ? '' : `<div style="margin-top:3px">${esc(e.why)}</div>`}
    <div class="src">Source: ${esc(e.src)}</div>
  </div>`).join('');
}

function priceBlock() {
  return `<div class="price">
    <div class="n">${esc(D.PRICE.list)}</div>
    <div><b>${esc(D.PRICE.package)}</b> &middot; discount headroom ${esc(D.PRICE.headroom)}</div>
    <div class="meta" style="margin-top:4px">${esc(D.PRICE.note)}</div>
    <div class="meta">${esc(D.PRICE.source)}</div>
  </div>`;
}

function obligationsTable() {
  return `<table>
    <tr><th style="width:52%">The customer supplies</th><th style="width:20%">By when</th>
      <th>Source</th></tr>
    ${D.CUSTOMER_OBLIGATIONS.map((o) => `<tr><td>${esc(o.o)}</td>
      <td><b>${esc(o.when)}</b></td><td class="meta">${esc(o.src)}</td></tr>`).join('')}
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
    table { font-size:8pt; margin:3px 0 6px; }
    td, th { padding:3px 6px; }
    .price { padding:8px 11px; margin:4px 0 8px; }
    .price .n { font-size:20pt; }`;

  const body = `<div class="wrap">
    <h1>C7.2 &middot; Pilot Proposal Template</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; price from C2.3 approved 12 Oct 2026
      &middot; every claim registry-checked at build time</div>
    <div class="rule"></div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>The price is fixed</h2>
        ${priceBlock()}
        <h2>What the customer must supply</h2>
        ${obligationsTable()}
      </div>
      <div class="col">
        <h2>What the proposal excludes, and why</h2>
        ${exclusionCards(true)}
        <div class="meta">Three of these come from our own C2.2 capability audit rather than
          from commercial caution. A build assertion fails if fewer than three do.</div>
      </div>
    </div>
  </div>`;

  return htmlDoc({ title: 'C7.2 - Pilot Proposal Template', css, body });
}

function buildDocument() {
  const css = `${baseCss()}
    ${SHARED}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }`;

  const body = `<div class="wrap">
    <h1>C7.2 &middot; Pilot Proposal Template</h1>
    <div class="meta">${esc(D.AS_OF)} &middot; Ticket C7.2 &middot; blocks C9.6</div>
    <div class="rule"></div>

    <div class="asked">
      <b>What the ticket asked for.</b> The proposal that turns a demo into a signed pilot:
      scope, explicit exclusions, what the customer must supply, timeline, success metrics,
      price and the signature path, with every variable field marked and every externally
      visible claim existing in the C0.6 registry.
      <br><br>
      <b>What was delivered.</b> All of it, with the exclusions sourced from our own
      capability audit rather than written defensively, and a build assertion that greps the
      rendered template for registry-prohibited wording.
    </div>

    <div class="takeaway">
      <div class="label">The takeaway</div>
      <div class="headline">${esc(D.HEADLINE)}</div>
    </div>
    ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

    <h2>1. Variable fields</h2>
    <table>
      <tr><th style="width:26%">Field</th><th>What goes in it</th></tr>
      ${D.VARIABLES.map((v) => `<tr><td><span class="var">${esc(v.v)}</span></td>
        <td>${esc(v.what)}</td></tr>`).join('')}
    </table>

    <h2>2. Scope</h2>
    <ul>${D.SCOPE.map((s) => `<li style="margin-bottom:4px">${esc(s)}</li>`).join('')}</ul>

    <h2>3. Exclusions</h2>
    <p>Stated in the proposal itself, not in a footer. Three come from the C2.2 capability
    audit, which examined what the platform can actually evidence today.</p>
    ${exclusionCards(false)}

    <h2>4. What the customer supplies</h2>
    ${obligationsTable()}

    <h2>5. Success metrics</h2>
    <p>Measured against the customer&rsquo;s own baseline. C4.7 refused to publish a
    time-to-productivity improvement, a rework reduction, a benchmark salary, an expected
    return or a payback period, because none is evidenced, so this proposal measures rather
    than predicts.</p>
    <table>
      <tr><th style="width:46%">Metric</th><th>How it is measured</th></tr>
      ${D.SUCCESS_METRICS.map((m) => `<tr><td><b>${esc(m.m)}</b></td>
        <td>${esc(m.how)}</td></tr>`).join('')}
    </table>

    <h2>6. Price</h2>
    ${priceBlock()}

    <h2>7. Signature path</h2>
    <p>Proposal accepted in writing by <span class="var">{{SIGNATORY}}</span>, then the SOW
    from C7.3 is issued. The pilot clock starts at day 0 contracting, not at proposal
    acceptance, and the day-0 obligations above are the start condition.</p>

    <h2>8. Wording this template may never use</h2>
    <table>
      <tr><th style="width:26%">Never</th><th style="width:18%">Registry row</th>
        <th>Instead</th></tr>
      ${D.PROHIBITED.map((p) => `<tr><td><b>${esc(p.word)}</b></td><td>${esc(p.row)}</td>
        <td>${esc(p.instead)}</td></tr>`).join('')}
    </table>
    <div class="note"><b>Checked, not trusted.</b> The build greps the rendered template for
    each of these and fails rather than shipping wording that would appear in every proposal
    made from it.</div>

    <h2>9. Limits</h2>
    <ol>${D.LIMITS.map((l) => `<li style="margin-bottom:5px">${esc(l)}</li>`).join('')}</ol>
  </div>`;

  return htmlDoc({ title: 'C7.2 - Pilot Proposal Template', css, body });
}

module.exports = { buildVisual, buildDocument };
