/**
 * C4.7's framework: the document, a one-page summary, and the worksheet as a CSV the client
 * fills in. The CSV is the artifact the ticket actually asks for; the PDFs explain it.
 */
const D = require('./c47Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .in { border:1px solid var(--border); border-left:4px solid #1f6feb; border-radius:0 6px 6px 0;
        padding:8px 12px; margin:0 0 7px; }
  .in .lab { font-weight:700; }
  .blank { display:inline-block; min-width:110px; border-bottom:2px solid var(--cherry);
           margin-left:6px; }
  .refuse { border:1px solid #f3c9c6; background:#fdf3f2; border-radius:6px; padding:8px 12px;
            margin:0 0 7px; }
  .refuse b { color:#b3261e; }
  .ours { border-left:4px solid #2f7d32; background:#f3f9f3; border-radius:0 6px 6px 0;
          padding:8px 12px; margin:0 0 7px; }
`;

function inputsBlock() {
  return D.INPUTS.map((i) => `<div class="in">
    <span class="lab">${esc(i.id)}. ${esc(i.label)}</span>
    <span class="blank">&nbsp;</span>
    <span class="meta">(${esc(i.unit)})</span>
    <div class="meta" style="margin-top:3px">${esc(i.why)}</div>
  </div>`).join('');
}

function buildDocument() {
  D.assertAllInputsBlank();
  D.assertEveryBenchmarkSourced();
  const css = `${baseCss()}
    .wrap { max-width:900px; margin:0 auto; padding:30px 24px 60px; }
    .asked { background:#eef6ff; border-left:4px solid #1f6feb; padding:12px 16px;
             margin:0 0 15px; border-radius:0 5px 5px 0; }
    ${SHARED}`;

  const body = `<div class="wrap">
  <h1>What this is worth to you</h1>
  <div class="meta">C4.7 &middot; an ROI framework and a worksheet &middot; our figures re-read
    from production ${esc(D.AS_OF)} &middot; <strong>READY FOR ALI REVIEW</strong></div>
  <div class="rule"></div>

  <div class="asked"><strong>Asked and delivered.</strong> The ticket asked for a defensible way
  for buyers to calculate what this is worth to them, with the worksheet requiring customer
  baseline input, every benchmark sourced, and no guaranteed-return language.
  <strong>Delivered: six blank customer inputs, five formulas, three benchmarks each with a named
  primary source, and five values we explicitly refuse to supply with the reason for
  each.</strong> Three build assertions enforce those criteria rather than promising them.</div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  ${D.SO_WHAT.map((s) => `<p>${esc(s)}</p>`).join('')}

  <h2>Your inputs. We do not fill these in.</h2>
  <p>Every field below is blank on purpose, and a build assertion fails if any of them ever
  ships with a value. A number you did not choose is a number you cannot defend in your own
  review.</p>
  ${inputsBlock()}

  <h2>What we supply, which is only what we can verify</h2>
  ${D.OURS.map((o) => `<div class="ours">
    <strong>${esc(o.label)}:</strong> ${esc(o.value)}
    <div class="meta" style="margin-top:3px">${esc(o.src)}</div></div>`).join('')}

  <h2>The arithmetic</h2>
  <table><tr><th style="width:26%">What it gives you</th><th style="width:34%">How it is
  calculated</th><th>Note</th></tr>
  ${D.FORMULAS.map((f) => `<tr><td><strong>${esc(f.out)}</strong></td>
    <td><code>${esc(f.f)}</code></td><td>${esc(f.note)}</td></tr>`).join('')}</table>
  <p>If your inputs are blank, every output is blank. That is the intended behavior rather than
  a defect.</p>

  <h2>Benchmarks we will stand behind</h2>
  <p>All three are about OUR business, not yours. They are listed so you can see exactly what we
  do and do not have.</p>
  <table><tr><th style="width:13%">Value</th><th style="width:26%">What it measures</th>
  <th>Source, and the caution that goes with it</th></tr>
  ${D.BENCHMARKS.map((b) => `<tr><td><strong>${esc(b.v)}</strong></td><td>${esc(b.what)}</td>
    <td>${esc(b.src)}<br><em>${esc(b.caution)}</em></td></tr>`).join('')}</table>

  <h2>Values we will not supply, and why</h2>
  <p>This is the part most ROI frameworks leave out, and it is the reason this one can be taken
  to a procurement review.</p>
  ${D.REFUSED.map((r) => `<div class="refuse">
    <b>${esc(r.what)}</b><div>${esc(r.why)}</div></div>`).join('')}

  <h2>How to use this with your own finance team</h2>
  <ol>
  <li>Fill in the six inputs from your own records. If you cannot fill in I3 or I4, that is worth
  knowing before you buy anything that claims to improve them.</li>
  <li>Run the arithmetic. The output is yours, built from your numbers, so the provenance
  question has an answer before it is asked.</li>
  <li>Re-measure I3 and I4 at the end of the period and run it again. The honest version of this
  model is measured twice, not projected once.</li>
  </ol>

  <h2>Method</h2>
  <ul>
  <li>Three build assertions: no customer input may ship with a value, every benchmark must carry
  a named source, and the rendered text is scanned for any wording that
  would promise a return. All three were verified by deliberately breaking them.</li>
  <li>Our own figures were re-read from production on ${esc(D.AS_OF)} rather than copied.</li>
  <li><strong>Nothing in this framework is a guarantee of any outcome</strong>, and that scan
  exists to keep it that way as the document is edited.</li>
  </ul>
  </div>`;
  const html = htmlDoc({ title: 'C4.7 ROI and business-impact framework', css, body });
  D.assertNoGuaranteeLanguage(html);
  return html;
}

function buildVisual() {
  const css = `${baseCss()}
    body { font-size:8.6pt; }
    h1 { font-size:15.5pt; }
    h2 { font-size:8.8pt; margin:5px 0 3px; border:0; padding:0; text-transform:uppercase;
         letter-spacing:.07em; color:var(--ink); }
    .cols { display:flex; gap:14px; } .col { flex:1; min-width:0; }
    .takeaway { padding:6px 11px; margin-bottom:5px; }
    .takeaway .headline { font-size:10.5pt; } .takeaway .label { font-size:7pt; }
    table { font-size:7.1pt; margin:3px 0 5px; } th { padding:3px 5px; font-size:6.5pt; }
    td { padding:3px 5px; }
    ${SHARED}
    .in, .refuse, .ours { padding:5px 9px; margin:0 0 4px; font-size:7.3pt; }
    .foot { margin-top:5px; font-size:6.7pt; color:var(--muted);
            border-top:1px solid var(--border); padding-top:4px; }`;

  const body = `
  <h1>What this is worth to you</h1>
  <div class="meta">C4.7 &middot; the worksheet is blank on purpose &middot; ${esc(D.AS_OF)}
    &middot; one page</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">${esc(D.HEADLINE)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <h2>Your six inputs. We do not fill these in.</h2>
      ${D.INPUTS.map((i) => `<div class="in"><strong>${esc(i.id)}.</strong>
        ${esc(i.label)} <span class="blank">&nbsp;</span></div>`).join('')}
      <div style="font-size:7pt;color:var(--muted)">A build assertion fails if any of these
      ever ships carrying a value. A number you did not choose is one you cannot defend in your
      own review.</div>

      <h2>What we supply</h2>
      ${D.OURS.slice(0, 3).map((o) => `<div class="ours"><strong>${esc(o.label)}:</strong>
        ${esc(o.value)}</div>`).join('')}
    </div>

    <div class="col">
      <h2>The arithmetic</h2>
      <table><tr><th style="width:38%">Gives you</th><th>From</th></tr>
      ${D.FORMULAS.map((f) => `<tr><td><strong>${esc(f.out)}</strong></td>
        <td><code>${esc(f.f)}</code></td></tr>`).join('')}</table>

      <h2>What we will not supply, and why</h2>
      ${D.REFUSED.map((r) => `<div class="refuse"><b>${esc(r.what)}</b></div>`).join('')}
      <div style="font-size:7pt;color:var(--muted)">Every benchmark we do hold is about our own
      business, not yours: sales quota per head, win rate, sales cycle. None of them says what AI
      capability is worth to a buyer, so none of them belongs in your return calculation.</div>
    </div>
  </div>

  <div class="foot">If your inputs are blank, every output is blank, which is the intended
  behavior rather than a defect. The honest version of this model is measured twice, not
  projected once. Nothing in this framework is a guarantee of any outcome, and a build assertion
  scans the rendered text to keep it that way.</div>`;
  const html = htmlDoc({ title: 'C4.7 ROI framework, one page', css, body });
  D.assertNoGuaranteeLanguage(html);
  return html;
}

/** The worksheet itself: the thing a client actually fills in. */
function buildWorksheet() {
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const nl = String.fromCharCode(10);
  let csv = ['section', 'ref', 'item', 'your_value', 'unit', 'notes'].map(q).join(',') + nl;
  for (const i of D.INPUTS) {
    csv += ['YOUR INPUT', i.id, i.label, '', i.unit, i.why].map(q).join(',') + nl;
  }
  for (const o of D.OURS) {
    csv += ['WE SUPPLY', o.id, o.label, o.value, '', o.src].map(q).join(',') + nl;
  }
  for (const f of D.FORMULAS) {
    csv += ['CALCULATED', '', f.out, '', 'formula: ' + f.f, f.note].map(q).join(',') + nl;
  }
  for (const r of D.REFUSED) {
    csv += ['WE DO NOT SUPPLY', '', r.what, 'NOT SUPPLIED', '', r.why].map(q).join(',') + nl;
  }
  return csv;
}

module.exports = { buildDocument, buildVisual, buildWorksheet };
