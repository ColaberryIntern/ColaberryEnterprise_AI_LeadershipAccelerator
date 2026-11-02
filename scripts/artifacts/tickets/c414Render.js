/**
 * C4.14's two deliverables: a one-page decision sheet and the full record.
 *
 * The one-pager leads with the scope table, because the gap between what the ticket
 * thought was there and what was there is the thing worth knowing. The document carries
 * the phrasings, the registry rows, the criteria and the flags.
 */
const D = require('./c414Data');
const { esc, baseCss, TOKENS, SEV } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const css = () => `${baseCss()}
  .lede { font-size: 12.5px; line-height: 1.5; }
  .kpi { display: flex; gap: 10px; margin: 10px 0; }
  .kpi > div { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 10px;
    background: ${TOKENS.BG_ALT}; }
  .kpi .n { font-size: 20px; font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; line-height: 1.1; }
  .kpi .l { font-size: 9px; color: ${TOKENS.MUTED}; text-transform: uppercase;
    letter-spacing: .04em; margin-top: 3px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
  table.t th { text-align: left; background: ${TOKENS.BG_ALT}; padding: 5px 6px;
    border-bottom: 1.5px solid ${TOKENS.BORDER}; font-size: 9px; text-transform: uppercase;
    letter-spacing: .03em; color: ${TOKENS.MUTED}; }
  table.t td { padding: 5px 6px; border-bottom: 1px solid ${TOKENS.BORDER}; vertical-align: top; }
  table.t td.num { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 600; }
  .miss { color: ${TOKENS.CHERRY_DEEP}; font-weight: 700; }
  .box { border-left: 3px solid ${TOKENS.CHERRY}; background: ${TOKENS.CHERRY_BG};
    padding: 8px 11px; margin: 10px 0; font-size: 11px; line-height: 1.5; }
  .chip { display: inline-block; font-size: 8.5px; font-weight: 700; padding: 1px 6px;
    border-radius: 9px; text-transform: uppercase; letter-spacing: .04em; }
  .chip.met { background: #e8f3e9; color: ${SEV.ok}; }
  .chip.blocked { background: #fdecea; color: ${SEV.bad}; }
  .chip.ok { background: #e8f3e9; color: ${SEV.ok}; }
  .flag { border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 11px;
    margin: 7px 0; font-size: 10.5px; line-height: 1.5; }
  .flag h4 { margin: 0 0 4px; font-size: 11px; }
  .flag .sev { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; font-weight: 700; }
  h2 { font-size: 14px; margin: 16px 0 6px; }
  h3 { font-size: 11.5px; margin: 12px 0 4px; color: ${TOKENS.CHERRY_DEEP}; }
  p { font-size: 11px; line-height: 1.55; margin: 6px 0; }
  code { font-size: 9.5px; }
`;

function kpis() {
  const missed = D.PHRASINGS.filter((p) => p.missedByObviousSearch).length;
  return `<div class="kpi">
    <div><div class="n">${D.COUNTS.files}</div><div class="l">files, vs the 19 estimated</div></div>
    <div><div class="n">${D.COUNTS.phrasings}</div><div class="l">phrasings of one claim</div></div>
    <div><div class="n">${missed}</div><div class="l">phrasings that search misses</div></div>
    <div><div class="n">0</div><div class="l">blocked phrasings remaining</div></div>
  </div>`;
}

function scopeTable() {
  const rows = D.SCOPE.map((s) => `<tr>
    <td>${esc(s.what)}</td><td>${esc(s.ticket)}</td>
    <td class="miss">${esc(s.measured)}</td><td>${esc(s.note)}</td></tr>`).join('');
  return `<table class="t">
    <tr><th>what</th><th>the ticket said</th><th>measured</th><th>note</th></tr>${rows}</table>`;
}

function criteriaTable(withEvidence) {
  const rows = D.CRITERIA.map((c) => `<tr>
    <td class="num">${c.n}</td><td>${esc(c.text)}</td>
    <td><span class="chip met">${esc(c.verdict)}</span></td>
    ${withEvidence ? `<td>${esc(c.evidence)}</td>` : ''}</tr>`).join('');
  return `<table class="t">
    <tr><th>#</th><th>done means</th><th></th>${withEvidence ? '<th>evidence</th>' : ''}</tr>
    ${rows}</table>`;
}

function buildVisual() {
  const missed = D.PHRASINGS.filter((p) => p.missedByObviousSearch);
  const body = `
  <h1>C4.14 &middot; The claim is off the public hub, and the instruction that kept
  putting it back is fixed</h1>
  <p class="lede"><strong>"5,000+ careers since 2012" was readable by anyone, because
  /knowledge is a public static hub.</strong> The registry blocks it: "careers launched"
  most naturally means hires, which production measured at 691, so the figure overstated
  the outcome by roughly an order of magnitude. All ${D.COUNTS.files} files now carry the
  approved claim, and a CI check fails the build if any phrasing comes back.</p>
  ${kpis()}
  <h3>The ticket's scope was low in four ways, and finding that out was most of the work</h3>
  ${scopeTable()}
  <div class="box"><strong>Three phrasings escape a search for "5,000+".</strong>
  ${missed.map((p) => esc('"' + p.text + '" (' + p.found + ')')).join('; ')}. Those files
  would have shipped the claim after a fix that looked complete, and one of them is a
  generator source. The new check searches all ${D.COUNTS.phrasings} phrasings.</div>
  <h3>Done means</h3>
  ${criteriaTable(false)}
  <p style="font-size:10px;color:${TOKENS.MUTED};margin-top:8px">Measured against the
  working tree on ${esc(D.MEASURED_AT)}. Replacement is
  <code>trackrecord.hired</code> "1,000+ hires" - a weaker line than the one it replaces,
  and the honest one.</p>`;
  return htmlDoc({ title: 'C4.14 - knowledge hub claims', css: css(), body });
}

function buildDocument() {
  const phr = D.PHRASINGS.map((p) => `<tr>
    <td><code>${esc(p.text)}</code></td><td>${esc(p.found)}</td>
    <td>${p.missedByObviousSearch ? '<span class="chip blocked">missed</span>' : ''}</td>
  </tr>`).join('');

  const reg = D.REGISTRY.map((r) => `<tr>
    <td><code>${esc(r.key)}</code></td><td>${esc(r.wording)}</td>
    <td><span class="chip ${r.status === 'BLOCKED' ? 'blocked' : 'ok'}">${esc(r.status)}</span></td>
    <td>${esc(r.use)}</td></tr>`).join('');

  const ver = D.VERIFICATION.map((v) => `<tr>
    <td>${esc(v.gate)}</td><td>${esc(v.result)}</td></tr>`).join('');

  const flags = D.FLAGS.map((f) => `<div class="flag">
    <div class="sev">${esc(f.id)} &middot; ${esc(f.severity)}</div>
    <h4>${esc(f.title)}</h4><div>${esc(f.detail)}</div></div>`).join('');

  const body = `
  <h1>C4.14 &middot; Remove the unsourced careers claim from the public knowledge hub</h1>
  <p class="lede"><strong>The claim was reachable without asking us for anything.</strong>
  <code>/knowledge</code> is a public static hub, not an authenticated route, and it carried
  "5,000+ careers since 2012" in ${D.COUNTS.files} files. The claim registry blocks that
  figure: <code>trackrecord.careers</code> is superseded because "careers launched" most
  naturally means hires, and production measured 691 of those. The hub also contains the
  design system's own guidance, which is what made the claim self-propagating.</p>
  ${kpis()}

  <h2>What the ticket thought was there, and what was</h2>
  ${scopeTable()}

  <h2>One claim, ${D.COUNTS.phrasings} phrasings</h2>
  <p>A search for the obvious string finds 25 files. The three marked below are why the
  guard matches phrases rather than a figure: they spell the number out, and one of them
  sits in <code>data/compliance-kb.js</code>, a source <code>kb.json</code> is generated
  from. Six design templates also print the figure in one element with its label -
  "Careers changed", "Graduates placed" - in a sibling, so a line-scoped pass fixes the
  number and leaves the label. Four needed placing by hand.</p>
  <table class="t">
    <tr><th>phrasing</th><th>where</th><th></th></tr>${phr}</table>

  <h2>The registry rows this relies on</h2>
  <p>Nothing new was minted. Every occurrence in the hub was an <strong>outcome</strong>
  claim, so every one became the approved outcome claim.</p>
  <table class="t">
    <tr><th>key</th><th>wording</th><th>status</th><th>use</th></tr>${reg}</table>
  <div class="box"><strong>Why not the bigger number.</strong>
  <code>trackrecord.students</code> "8k+ data students" is approved and verified, and using
  it here would have kept a large figure by changing what is asserted from an outcome to an
  enrollment. That is the same failure in a new coat, so it was not done. "1,000+ hires" is
  a materially weaker marketing line and it is the honest one.</div>

  <h2>Done means</h2>
  ${criteriaTable(true)}

  <h2>Verification actually run</h2>
  <table class="t"><tr><th>gate</th><th>result</th></tr>${ver}</table>

  <h2>Flags</h2>
  ${flags}

  <p style="font-size:10px;color:${TOKENS.MUTED};margin-top:14px">Measured against the
  working tree on ${esc(D.MEASURED_AT)}. No production data was read or written for this
  ticket. REVIEW STATE: READY FOR ALI REVIEW - PR OPEN.</p>`;
  return htmlDoc({ title: 'C4.14 - knowledge hub claims', css: css(), body });
}

module.exports = { buildVisual, buildDocument };
