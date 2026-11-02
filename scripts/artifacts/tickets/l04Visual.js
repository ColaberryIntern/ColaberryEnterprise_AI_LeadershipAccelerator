/**
 * The L0.4 one-page visual: how much of the board the merged work actually accounts for,
 * and where the map between them breaks.
 *
 * ONE PAGE, landscape, or the renderer refuses. The question this answers before the document
 * is opened: 14 pull requests merged against this initiative, so which tickets do they
 * discharge - and the uncomfortable half of the answer, which ones discharge nothing because
 * no ticket corresponds to them.
 *
 * Every figure is derived from l04Data rather than typed here, so the page cannot drift from
 * the document it ships beside.
 */
const D = require('./l04Data');
const { esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CONF = {
  stated: { label: 'stated', bg: '#eaf5ea', fg: '#2f7d32' },
  inferred: { label: 'inferred', bg: '#fff6e8', fg: '#8a5200' },
  unmapped: { label: 'no ticket', bg: '#fdf3f2', fg: '#b3261e' },
};

const CSS = `${baseCss()}
  body { font-size: 8.5pt; }
  h1 { font-size: 16pt; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 8pt; margin: 0 0 7px; }
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 7px 11px; margin: 0 0 9px; font-size: 8.4pt; }
  .wrap { display: flex; gap: 16px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  .col.wide { flex: 1.5; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink);
       border: 0; padding: 0; margin: 0 0 5px; }
  table { font-size: 7.1pt; width: 100%; margin: 0 0 7px; }
  th { padding: 3px 5px; font-size: 6.6pt; }
  td { padding: 2.5px 5px; vertical-align: top; }
  .pill { display: inline-block; padding: 1px 5px; border-radius: 7px; font-size: 6.3pt;
          font-weight: 700; letter-spacing: .03em; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .stat { display: flex; gap: 9px; margin-bottom: 8px; }
  .stat > div { flex: 1; border: 1px solid var(--border); border-radius: 5px; padding: 6px 8px; }
  .stat .big { font-size: 15pt; font-weight: 700; color: var(--cherry); line-height: 1.05; }
  .stat .lbl { font-size: 6.4pt; color: var(--muted); text-transform: uppercase;
               letter-spacing: .05em; }
  .gap { border-left: 2px solid var(--border); padding: 0 0 0 7px; margin-bottom: 6px; }
  .gap.bad { border-left-color: #b3261e; }
  .gap.watch { border-left-color: #b26a00; }
  .gap b { font-size: 7.4pt; }
  .gap span { display: block; color: var(--muted); font-size: 6.9pt; margin-top: 1px; }
  .foot { margin-top: 7px; font-size: 6.8pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 5px; }
`;

function groupRows() {
  return D.BOARD.map((b) => {
    const tot = b.open + b.done;
    const pct = tot ? Math.round((b.done / tot) * 100) : 0;
    return `<tr>
      <td>${esc(b.g)}</td>
      <td class="num">${b.open}</td>
      <td class="num" style="color:#2f7d32">${b.done}</td>
      <td class="num" style="color:${pct === 0 ? '#b3261e' : 'var(--muted)'}">${pct}%</td>
    </tr>`;
  }).join('');
}

function mapRows() {
  return D.MAP.map((m) => {
    const c = CONF[m.conf];
    const pr = D.PRS.find((p) => p.pr === m.pr);
    return `<tr>
      <td><code>#${m.pr}</code></td>
      <td>${m.id ? '<strong>' + esc(m.id) + '</strong>' : '<span style="color:#b3261e">none</span>'}</td>
      <td>${m.state ? esc(m.state) : '-'}</td>
      <td><span class="pill" style="background:${c.bg};color:${c.fg}">${esc(c.label)}</span></td>
      <td class="num">${pr ? pr.files : '?'}</td>
      <td class="num">${pr ? '+' + pr.adds.toLocaleString('en-US') : '?'}</td>
    </tr>`;
  }).join('');
}

function build() {
  // Derived, never typed: the page must not be able to disagree with the data module.
  const files = D.PRS.reduce((n, p) => n + p.files, 0);
  const tests = D.PRS.reduce((n, p) => n + p.tests, 0);
  const adds = D.PRS.reduce((n, p) => n + p.adds, 0);
  const stated = D.MAP.filter((m) => m.conf === 'stated').length;
  const unmapped = D.MAP.filter((m) => m.conf === 'unmapped').length;

  // Open tickets that any merged PR lands against.
  const openWithEvidence = new Set(
    D.MAP.filter((m) => m.state === 'OPEN' && m.id).map((m) => m.id),
  );
  const openBare = D.TOTALS.open - openWithEvidence.size;

  const body = `
<h1>Colaberry Live: requirement, ticket, evidence</h1>
<p class="sub">
  L0.4 traceability matrix &middot; ${esc(D.META.project)} &middot; read live ${esc(D.META.date)}
  &middot; session ${esc(D.META.session)}
</p>

<div class="takeaway">
  <strong>${openBare} of the ${D.TOTALS.open} open tickets have no merged code against them at all.</strong>
  The other ${openWithEvidence.size} do - and not one of them carries a review state, so the board shows
  identical empty checkboxes for work that is in production and work that has never been started.
  Two pull requests, ${D.MAP.filter((m) => m.conf === 'unmapped').reduce((n, m) => n + (D.PRS.find((p) => p.pr === m.pr) || { files: 0 }).files, 0)}
  files of it, match no ticket on the board.
</div>

<div class="stat">
  <div><div class="big">${D.TOTALS.all}</div><div class="lbl">tickets on the board</div></div>
  <div><div class="big">${D.TOTALS.open}</div><div class="lbl">open &middot; ${D.TOTALS.done} done</div></div>
  <div><div class="big">${D.PRS.length}</div><div class="lbl">merged pull requests</div></div>
  <div><div class="big">${files}</div><div class="lbl">files &middot; ${tests} test files</div></div>
  <div><div class="big">+${adds.toLocaleString('en-US')}</div><div class="lbl">lines added</div></div>
  <div><div class="big" style="color:#b3261e">${stated}</div><div class="lbl">joins the PR itself states</div></div>
</div>

<div style="margin-bottom:8px">
  ${stackBar({
    parts: [
      { label: D.TOTALS.done + ' done', value: D.TOTALS.done, color: '#2f7d32' },
      { label: openWithEvidence.size + ' open, work landed', value: openWithEvidence.size, color: '#b26a00' },
      { label: openBare + ' open, nothing landed', value: openBare, color: '#b3261e' },
    ],
    width: 1020,
    height: 26,
  })}
</div>

<div class="wrap">
  <div class="col">
    <h2>The board by group</h2>
    <table>
      <thead><tr><th>Group</th><th class="num">Open</th><th class="num">Done</th><th class="num">Done</th></tr></thead>
      <tbody>${groupRows()}</tbody>
    </table>
    <h2>What this does not establish</h2>
    <div style="font-size:6.9pt;color:#718096">
      Ticket descriptions were never read, so no acceptance criteria were checked. Every join is
      the pull request's scope against the ticket's <em>title</em>. ${stated} of ${D.MAP.length}
      joins are stated by the PR itself; ${D.MAP.length - stated - unmapped} are inferred here.
      Nothing has been closed and no review state has been set.
    </div>
  </div>

  <div class="col wide">
    <h2>Pull request to ticket</h2>
    <table>
      <thead><tr><th>PR</th><th>Ticket</th><th>State</th><th>Join</th><th class="num">Files</th><th class="num">Lines</th></tr></thead>
      <tbody>${mapRows()}</tbody>
    </table>
  </div>

  <div class="col">
    <h2>Where the map breaks</h2>
    ${D.GAPS.map((g) => `<div class="gap ${g.sev}"><b>${esc(g.h)}</b></div>`).join('')}
  </div>
</div>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.ticket)} &middot; ${esc(D.META.date)} &middot;
  session ${esc(D.META.session)} &middot; board read live from Basecamp; PR figures computed from
  git merge diffs, not from recollection &middot; built from the same data module as the document
</div>`;

  return htmlDoc({ title: 'L0.4 traceability matrix, one page', css: CSS, body });
}

module.exports = { build };
