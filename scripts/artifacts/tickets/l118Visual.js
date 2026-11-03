/**
 * L11.8, the one-pager: how much of the required documentation exists.
 *
 * WHAT THIS PAGE IS FOR. The ledger answers "where is DOC N". This page answers the question
 * asked before opening it — how much of the eighteen exists, how much landed in this pass, and
 * which required document nothing is tracking. Same data module, two audiences.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a second,
 * so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l118Data');
const { TOKENS, esc, baseCss, barChart, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const COLOR = {
  WRITTEN: TOKENS.SEV.ok,
  NOT_WRITTEN: TOKENS.SEV.watch,
  BLOCKED: TOKENS.MUTED,
};

function build() {
  const bar = stackBar({
    parts: [
      { label: `In the repo (${D.TOTALS.by.WRITTEN})`, value: D.TOTALS.by.WRITTEN,
        color: COLOR.WRITTEN },
      { label: `Not written (${D.TOTALS.by.NOT_WRITTEN})`, value: D.TOTALS.by.NOT_WRITTEN,
        color: COLOR.NOT_WRITTEN },
      { label: `Blocked (${D.TOTALS.by.BLOCKED})`, value: D.TOTALS.by.BLOCKED,
        color: COLOR.BLOCKED },
    ],
    width: 1000,
    height: 26,
  });

  // Requirements checked per document — the size of the contract each one carries.
  const reqs = barChart({
    rows: D.WRITTEN.map((d) => ({
      label: `DOC ${String(d.id).padStart(2, '0')} ${d.title.split('—')[0].trim().slice(0, 34)}`,
      value: d.requires.length,
      display: `${d.requires.length}`,
      color: TOKENS.CHERRY,
    })),
    max: 22,
    width: 470,
    barH: 15,
    gap: 5,
    labelW: 240,
  });

  const tiles = [
    { n: `${D.TOTALS.written} of ${D.TOTALS.required}`, l: 'required documents written' },
    { n: D.TOTALS.thisPass, l: 'written in this pass (DOC 00–08)' },
    { n: D.TOTALS.requirements, l: 'bootstrap requirements checked against disk' },
    { n: D.TOTALS.noTicket, l: 'required document with NO ticket', bad: true },
    { n: D.TOTALS.by.BLOCKED, l: 'blocked on something no document supplies' },
  ].map((t) => `<div class="tile${t.bad ? ' bad' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div>
    </div>`).join('\n');

  const remaining = D.LEDGER.filter((d) => d.state !== 'WRITTEN').map((d) => `<li>
      <strong>DOC ${String(d.id).padStart(2, '0')} ${esc(d.title)}</strong>
      — ${d.ticket ? esc(d.ticket) : '<span class="gap">no ticket</span>'}
    </li>`).join('\n');

  const body = `
<h1>Colaberry Live documentation — ${D.TOTALS.written} of ${D.TOTALS.required}</h1>
<p class="sub">L11.8 · ${esc(D.META.built)} · bootstrap §3.1 and §17 require DOC 00 through DOC 17
· generated from <code>l118Data.js</code>, every row checked against the disk</p>

<div class="tiles">${tiles}</div>

<div class="bar">${bar}</div>

<div class="cols">
  <div>
    <h2>Requirements checked, per document</h2>
    ${reqs}
    <p class="sub">Each one transcribed from the bootstrap and found in the file on disk.
    ${D.TOTALS.headings} of the ${D.TOTALS.requirements} must be navigable sections, not mentions.</p>
  </div>
  <div>
    <h2>What is still missing</h2>
    <ul class="rem">${remaining}</ul>
    <h2>The gap a board cannot show itself</h2>
    <p class="gapbox"><strong>DOC 10 has no ticket.</strong> Bootstrap §17 requires
    <em>COLABERRY LIVE — CURRENT BUILD MIGRATION REPORT</em>, six sections A–F, and names
    <code>docs/colaberry-live/</code> as its home. Nothing on board ${D.META.board} covers it.
    Found by counting §3.1 and §17 against all 61 todos, done and open.</p>
    <p class="sub">The fifth such gap on this program. The other four are definition-of-done
    conditions 17, 18, 19 and 40.</p>
  </div>
</div>
`;

  return htmlDoc({
    title: 'Colaberry Live — required project documents',
    css: `${baseCss()}
      .tiles { display: flex; gap: 10px; margin: 14px 0 10px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; color: ${TOKENS.INK}; line-height: 1.1; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.bad .n { color: ${TOKENS.SEV.bad}; }
      .bar { margin: 6px 0 14px; }
      .cols { display: flex; gap: 22px; }
      .cols > div { flex: 1; }
      h2 { font-size: 12px; margin: 10px 0 6px; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      ul.rem { margin: 0; padding-left: 15px; font-size: 10px; line-height: 1.5; }
      .gap { color: ${TOKENS.SEV.bad}; font-weight: 700; }
      .gapbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 9px; margin: 4px 0 6px; }`,
    body,
  });
}

module.exports = { build };
