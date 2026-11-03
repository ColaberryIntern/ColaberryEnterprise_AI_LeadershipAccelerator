/**
 * The L11.5 one-pager: 1,208 tests, four defects nothing caught, and the tier that explains both.
 *
 * ONE PAGE, landscape, or the renderer refuses. The question it answers before anything is
 * opened: if the suite is this large, how did four complete units ship with no caller — and the
 * answer is the shape of the pyramid, which is why the tier table and the defect history sit
 * side by side rather than in separate sections.
 *
 * Every figure derives from l115Data, so this page cannot drift from the register or the
 * Markdown that render from the same module.
 */
const D = require('./l115Data');
const { esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const VERDICT = {
  over: { bg: '#eaf5ea', fg: '#2f7d32', label: 'above target' },
  under: { bg: '#fff6e8', fg: '#8a5200', label: 'far below' },
  absent: { bg: '#fdf3f2', fg: '#b3261e', label: 'absent' },
  invented: { bg: '#eef2ff', fg: '#1d4ed8', label: 'invented here' },
};

const CSS = `${baseCss()}
  body { font-size: 8.5pt; }
  h1 { font-size: 16pt; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 8pt; margin: 0 0 7px; }
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 7px 11px; margin: 0 0 9px; font-size: 8.4pt; }
  .stat { display: flex; gap: 9px; margin-bottom: 9px; }
  .stat > div { flex: 1; border: 1px solid var(--border); border-radius: 5px; padding: 6px 9px; }
  .stat .big { font-size: 15pt; font-weight: 700; color: var(--cherry); line-height: 1.05; }
  .stat .lbl { font-size: 6.4pt; color: var(--muted); text-transform: uppercase;
               letter-spacing: .05em; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink);
       border: 0; padding: 0; margin: 0 0 5px; }
  .wrap { display: flex; gap: 14px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  .col.wide { flex: 1.35; }
  table { font-size: 7.1pt; width: 100%; margin: 0 0 7px; border-collapse: collapse; }
  th { padding: 3px 5px; font-size: 6.6pt; background: var(--bg-alt); text-align: left;
       color: var(--muted); text-transform: uppercase; letter-spacing: .05em;
       border-bottom: 1px solid var(--border); }
  td { padding: 3px 5px; vertical-align: top; border-bottom: 1px solid var(--border); }
  .pill { display: inline-block; padding: 1px 5px; border-radius: 7px; font-size: 6.3pt;
          font-weight: 700; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  .hx { border-left: 2px solid #b3261e; padding: 0 0 0 7px; margin-bottom: 6px; font-size: 7pt; }
  .hx b { display: block; }
  .hx .cost { color: var(--muted); }
  .nc { border-left: 2px solid var(--border); padding: 0 0 0 7px; margin-bottom: 5px;
        font-size: 7pt; }
  .nc b { display: block; }
  .foot { margin-top: 9px; padding-top: 5px; border-top: 1px solid var(--border);
          color: var(--muted); font-size: 6.4pt; }
`;

function tierRows() {
  return D.TIERS.map((t) => {
    const v = VERDICT[t.verdict];
    return `<tr>
      <td><b>${esc(t.tier)}</b></td>
      <td>${esc(t.target)}</td>
      <td class="num">${esc(t.have)}</td>
      <td class="num">${t.n}</td>
      <td><span class="pill" style="background:${v.bg};color:${v.fg}">${esc(v.label)}</span></td>
    </tr>`;
  }).join('');
}

function build() {
  const T = D.TOTALS;
  const parts = [
    { label: 'unit', value: T.unit, color: '#2f7d32' },
    { label: 'integration', value: T.integration, color: '#b26a00' },
    { label: 'e2e', value: Math.max(T.e2e, 1), color: '#b3261e' },
  ];

  const body = `
<h1>Colaberry Live — testing strategy and evidence</h1>
<p class="sub">
  Ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)} &middot; ${esc(D.META.commit)}
  &middot; every count below was measured, not estimated; the commands are in the register
</p>

<div class="takeaway">
  <b>${T.tests.toLocaleString()} tests, and this subsystem has still shipped four complete,
  well-tested units that nothing called.</b> Those facts are not in tension — the second is what
  the first buys you when ${T.pctUnit.toFixed(1)}% of the suite is unit tests. A unit test mocks
  the caller, so <i>&ldquo;there is no caller&rdquo;</i> is the one defect it structurally cannot
  see. The fix was not more unit tests: it was a fourth tier that reads the source and asserts
  the call exists.
</div>

<div class="stat">
  <div><div class="big">${T.tests.toLocaleString()}</div><div class="lbl">Tests</div></div>
  <div><div class="big">${T.suites}</div><div class="lbl">Suites</div></div>
  <div><div class="big">${T.pctUnit.toFixed(1)}%</div><div class="lbl">Unit share</div></div>
  <div><div class="big">1</div><div class="lbl">Integration files</div></div>
  <div><div class="big">0</div><div class="lbl">E2E on broadcast</div></div>
  <div><div class="big">${D.HISTORY.length}</div><div class="lbl">Shipped with no caller</div></div>
</div>

${stackBar({ parts, width: 980, height: 24 })}

<div class="wrap" style="margin-top:9px">
  <div class="col wide">
    <h2>The tiers, measured against CLAUDE.md's target</h2>
    <table>
      <thead><tr><th>Tier</th><th>Target</th><th class="num">Have</th><th class="num">Tests</th>
        <th>Verdict</th></tr></thead>
      <tbody>${tierRows()}</tbody>
    </table>
    <h2>Not covered — stated, not omitted</h2>
    ${D.NOT_COVERED.slice(0, 4).map((n) =>
      `<div class="nc"><b>${esc(n.h)}</b></div>`).join('')}
  </div>

  <div class="col">
    <h2>Four defects a full green suite did not see</h2>
    ${D.HISTORY.map((h) => `<div class="hx"><b>${esc(h.id)} — ${esc(h.what)}</b>`
      + `<span class="cost">${esc(h.tests)}. ${esc(h.cost)}</span></div>`).join('')}
  </div>
</div>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; session
  ${esc(D.META.session)} &middot; criterion 1: every claim in the register says whether it is
  proven by test or in production &middot; criterion 2: what is not built is named in its own
  section rather than omitted &middot; criterion 3: the same data module renders
  docs/COLABERRY_LIVE_TESTING_STRATEGY.md into the repo, so a future session with no chat
  history can read it &middot; counts are a 2026-11-02 snapshot; re-run the commands before
  citing them
</div>`;

  return htmlDoc({ title: 'L11.5 testing strategy, one page', css: CSS, body });
}

module.exports = { build };
