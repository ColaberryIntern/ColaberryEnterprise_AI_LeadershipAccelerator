/**
 * L11.1, the one-pager: how much of the architecture handbook rests on something that has run.
 *
 * WHAT THIS PAGE IS FOR. The register answers "is capability N proven". This page answers the
 * question asked before opening it — how much of the system has ever actually run, and what the
 * gap between "tested" and "proven" costs. Same data module, two audiences.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a second,
 * so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l111Data');
const { TOKENS, esc, baseCss, barChart, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const COLOR = {
  PRODUCTION: TOKENS.SEV.ok,
  TEST: TOKENS.LEAF,
  WIRED: TOKENS.SEV.watch,
  UNPROVEN: TOKENS.SEV.bad,
};

/** The four defects DOC 15 catalogs: the argument for the scale having four levels. */
const DEFECTS = [
  ['L4.6', 'Heartbeat route shipped with no caller — a real 20-minute airing recorded ZERO rows'],
  ['L7.1', 'Occurrence created with no provider binding — real, private, correct, unplayable'],
  ['L5.5', 'runProviderEvent exported, tested, called by nothing — go_live always refused'],
  ['L4.9', 'The player never called the heartbeat — every audience number a confident zero'],
];

function build() {
  const order = Object.entries(D.PROOFS).sort((a, b) => b[1].rank - a[1].rank);

  const bar = stackBar({
    parts: order.map(([k, v]) => ({
      label: `${v.label} (${D.TOTALS.by[k]})`,
      value: D.TOTALS.by[k],
      color: COLOR[k],
    })),
    width: 1000,
    height: 26,
  });

  const levels = barChart({
    rows: order.map(([k, v]) => ({
      label: v.label,
      value: D.TOTALS.by[k],
      display: `${D.TOTALS.by[k]} of ${D.TOTALS.claims}`,
      color: COLOR[k],
    })),
    max: D.TOTALS.claims,
    width: 460,
    barH: 18,
    gap: 7,
    labelW: 150,
  });

  const unproven = D.CLAIMS.filter((c) => c.proof === 'UNPROVEN')
    .map((c) => `<li><strong>${esc(c.claim)}</strong></li>`).join('\n');

  const defects = DEFECTS
    .map(([t, w]) => `<li><strong>${esc(t)}</strong> — ${esc(w)}</li>`).join('\n');

  const tiles = [
    { n: D.TOTALS.by.PRODUCTION, l: 'claims proven in a real airing', good: true },
    { n: D.TOTALS.neverRun, l: 'claims that have NEVER run', bad: true },
    { n: D.TOTALS.claims, l: 'capability claims, each with a proof level' },
    { n: D.TOTALS.sections, l: 'required sections, all present' },
    { n: '99.6%', l: 'of 1,208 tests are unit tests' },
  ].map((t) => `<div class="tile${t.bad ? ' bad' : ''}${t.good ? ' good' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div>
    </div>`).join('\n');

  const body = `
<h1>DOC 11 — ${D.TOTALS.by.PRODUCTION} of ${D.TOTALS.claims} capabilities have actually run</h1>
<p class="sub">${esc(D.META.ticket)} · ${esc(D.META.built)} · every capability claim in the
architecture handbook states whether it is proven by test or in production · generated from
<code>l111Data.js</code></p>

<div class="tiles">${tiles}</div>
<div class="bar">${bar}</div>

<div class="cols">
  <div>
    <h2>The proof scale</h2>
    ${levels}
    <p class="sub"><strong>Why four levels and not two.</strong> A unit test mocks its caller, so
    a missing caller is invisible to it. "Proven by test" and "has actually run" are different
    claims, and collapsing them is what let the four defects below ship.</p>
    <h2>Four defects a green suite did not catch</h2>
    <ul class="small">${defects}</ul>
  </div>
  <div>
    <h2>The ${D.TOTALS.unproven} unproven claims</h2>
    <ul class="small">${unproven}</ul>
    <p class="gapbox"><strong>The paywall has never refused an actual person.</strong> Entitlement
    is unit-tested and L10.7 is open and P0. It is the highest-consequence unproven claim in the
    system — the one guarantee that cannot be partially wrong.</p>
  </div>
</div>
`;

  return htmlDoc({
    title: 'DOC 11 — capability proof',
    css: `${baseCss()}
      .tiles { display: flex; gap: 10px; margin: 14px 0 10px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; color: ${TOKENS.INK}; line-height: 1.1; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.bad .n { color: ${TOKENS.SEV.bad}; }
      .tile.good .n { color: ${TOKENS.SEV.ok}; }
      .bar { margin: 6px 0 14px; }
      .cols { display: flex; gap: 22px; }
      .cols > div { flex: 1; }
      h2 { font-size: 12px; margin: 10px 0 6px; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      ul.small { margin: 0; padding-left: 15px; font-size: 9.5px; line-height: 1.5; }
      .gapbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 9px; margin: 8px 0 4px; }`,
    body,
  });
}

module.exports = { build };
