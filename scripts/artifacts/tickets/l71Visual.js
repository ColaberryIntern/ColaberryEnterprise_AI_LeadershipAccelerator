/**
 * The L7.1 one-page visual: what the reference corpus now covers, and at which layer.
 *
 * ONE PAGE, landscape, or the renderer refuses. The question this page answers before the
 * document is opened: the ticket asked for the corpus to be run across all the stages, so what
 * exactly is covered now, and what is still deferred with a reason.
 */
const D = require('./l71Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const LAYER = {
  generation: { label: 'generation', bg: '#eef3fb', fg: '#1f4e9c' },
  gate: { label: 'gate (pure)', bg: '#f3eefb', fg: '#5b2f9b' },
  both: { label: 'both', bg: '#fff6e8', fg: '#8a5200' },
  prompt: { label: 'prompt', bg: '#fdf3f2', fg: '#b3261e' },
};

const CSS = `${baseCss()}
  body { font-size: 8.5pt; }
  h1 { font-size: 16pt; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 8pt; margin: 0 0 7px; }
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 7px 11px; margin: 0 0 9px; font-size: 8.4pt; }
  .wrap { display: flex; gap: 16px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  .col.wide { flex: 1.45; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink);
       border: 0; padding: 0; margin: 0 0 5px; }
  table { font-size: 7.3pt; width: 100%; margin: 0 0 7px; }
  th { padding: 3px 5px; font-size: 6.6pt; }
  td { padding: 3px 5px; vertical-align: top; }
  .n { font-weight: 700; color: var(--muted); width: 14px; }
  .pill { display: inline-block; padding: 1px 5px; border-radius: 7px; font-size: 6.4pt;
          font-weight: 700; letter-spacing: .03em; white-space: nowrap; }
  .obs { color: #2f7d32; font-weight: 700; }
  .def { color: #b26a00; font-weight: 700; }
  .note { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px;
          padding: 6px 9px; font-size: 7.5pt; margin-bottom: 7px; }
  .big { font-size: 15pt; font-weight: 700; color: var(--cherry); line-height: 1.1; }
  .stat { display: flex; gap: 11px; margin-bottom: 7px; }
  .stat > div { flex: 1; border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; }
  .stat .lbl { font-size: 6.6pt; color: var(--muted); text-transform: uppercase;
               letter-spacing: .05em; }
  .foot { margin-top: 8px; font-size: 6.8pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 5px; }
`;

function caseRows() {
  return D.CASES.map((c) => {
    const l = LAYER[c.layer];
    return `<tr>
      <td class="n">${c.n}</td>
      <td><strong>${esc(c.name)}</strong><br><span style="color:#718096">${esc(c.fixture)}</span></td>
      <td><span class="pill" style="background:${l.bg};color:${l.fg}">${esc(l.label)}</span></td>
      <td>${esc(c.proves)}</td>
    </tr>`;
  }).join('');
}

function controlRows() {
  return D.CONTROLS.map((c) => `<tr>
    <td><code>${esc(c.id)}</code></td>
    <td class="${c.observed ? 'obs' : 'def'}">${c.observed ? 'OBSERVED FAILING' : 'DEFERRED'}</td>
    <td style="font-size:7pt">${esc(c.note)}</td>
  </tr>`).join('');
}

function build() {
  const v = D.VERIFICATION;
  const body = `
<h1>All eight corpus cases run, and two rules became reachable for the first time.</h1>
<p class="sub">L7.1 &middot; P7-T1.2 &middot; tests and fixtures only, ${v.productionModulesTouched} production modules touched &middot; ${esc(D.META.date)}</p>

<div class="takeaway">
  <strong>What to look at.</strong> The layer column. Five cases run through generation, but
  separation of duty and the stale-revision check are properties of the <em>gate</em>, which is
  pure and database-free by design, so testing them through generation would test the wrong layer.
  Case 7 is <strong>recorded, not closed</strong>: it found a real defect, carried on L9.6.
</div>

<div class="wrap">
  <div class="col wide">
    <h2>The eight required cases (reference-fixtures &sect;103)</h2>
    <table>
      <tr><th></th><th style="width:25%">Case</th><th style="width:15%">Layer</th><th>What it proves</th></tr>
      ${caseRows()}
    </table>
  </div>

  <div class="col">
    <div class="stat">
      <div><div class="lbl">New tests</div><div class="big">${v.newTests.reduce((a, b) => a + b.n, 0)}</div></div>
      <div><div class="lbl">Regression</div><div class="big">${v.regression.passed.toLocaleString('en-US')}</div>
        <div style="font-size:6.8pt;color:#718096">${v.regression.failed} failed</div></div>
    </div>

    <h2>Positive controls (&sect;139)</h2>
    <table>
      <tr><th style="width:38%">Check</th><th style="width:26%">State</th><th>Note</th></tr>
      ${controlRows()}
    </table>

    <div class="note">
      <strong>The rework edge is the unlock.</strong> Before this packet,
      <code>is_rework: true</code> appeared <strong>${v.rework.before.edges} times across
      ${v.rework.before.transitions} transitions</strong> in the fixture files, so
      <code>cyclingReworkEdges</code> and <code>REWORK_BOUND</code> had no reference fixture that
      could reach them. Now ${v.rework.after.edges} of ${v.rework.after.transitions}.
    </div>

    <div class="note">
      <strong>${v.knownLocalFailures.n} suites fail locally and are not mine:</strong>
      ${esc(v.knownLocalFailures.what)} &mdash; ${esc(v.knownLocalFailures.why)}.
      Zero failing tests.
    </div>
  </div>
</div>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)} &middot;
  session ${esc(D.META.session)} &middot; built from the same data module as the document
</div>`;
  return htmlDoc({ title: 'L7.1 corpus coverage, one page', css: CSS, body });
}

module.exports = { build };
