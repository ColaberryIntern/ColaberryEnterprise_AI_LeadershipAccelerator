/**
 * C10.2's two deliverables: a one-page decision sheet and the full record.
 *
 * The one-pager leads with the answer, because the question has one, and then with the
 * evidence that makes it a measurement rather than an opinion. The forecast gap is drawn
 * rather than described: it is the largest number on the page and the only one that needs a
 * decision.
 */
const D = require('./c102Data');
const { esc, baseCss, TOKENS, SEV } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const css = () => `${baseCss()}
  .lede { font-size: 12.5px; line-height: 1.5; }
  .answer { border: 2px solid ${TOKENS.CHERRY_DEEP}; border-radius: 8px; padding: 12px 16px;
    margin: 12px 0; background: ${TOKENS.CHERRY_BG}; }
  .answer .big { font-size: 20px; font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; line-height: 1.15; }
  .chartwrap { max-width: 560px; }
  .answer .sub { font-size: 11.5px; color: ${TOKENS.MUTED}; margin-top: 4px; }
  .kpi { display: flex; gap: 10px; margin: 10px 0; }
  .kpi > div { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 10px;
    background: ${TOKENS.BG_ALT}; }
  .kpi .n { font-size: 19px; font-weight: 700; color: ${TOKENS.CHERRY_DEEP}; line-height: 1.1; }
  .kpi .l { font-size: 8.5px; color: ${TOKENS.MUTED}; text-transform: uppercase;
    letter-spacing: .04em; margin-top: 3px; }
  table.t { width: 100%; border-collapse: collapse; font-size: 10px; margin: 8px 0; }
  table.t th { text-align: left; background: ${TOKENS.BG_ALT}; padding: 5px 6px;
    border-bottom: 1.5px solid ${TOKENS.BORDER}; font-size: 8.5px; text-transform: uppercase;
    letter-spacing: .03em; color: ${TOKENS.MUTED}; }
  table.t td { padding: 5px 6px; border-bottom: 1px solid ${TOKENS.BORDER}; vertical-align: top; }
  table.t td.num { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
  table.t tr.total td { font-weight: 700; background: ${TOKENS.BG_ALT}; }
  .zero { color: ${SEV.ok}; font-weight: 700; }
  .bad { color: ${SEV.bad}; font-weight: 700; }
  .box { border-left: 3px solid ${TOKENS.CHERRY}; background: ${TOKENS.CHERRY_BG};
    padding: 8px 11px; margin: 10px 0; font-size: 10.5px; line-height: 1.5; }
  .chip { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 6px;
    border-radius: 9px; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  .chip.met { background: #e8f3e9; color: ${SEV.ok}; }
  .chip.part { background: #fff6e5; color: ${SEV.watch}; }
  .chip.open { background: #fdecea; color: ${SEV.bad}; }
  .flag { border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 8px 11px;
    margin: 7px 0; font-size: 10.5px; line-height: 1.5; }
  .flag h4 { margin: 0 0 4px; font-size: 11px; }
  .flag .sev { font-size: 8px; text-transform: uppercase; letter-spacing: .05em;
    color: ${TOKENS.MUTED}; font-weight: 700; }
  h2 { font-size: 14px; margin: 15px 0 6px; }
  h3 { font-size: 11.5px; margin: 12px 0 4px; color: ${TOKENS.CHERRY_DEEP}; }
  p { font-size: 11px; line-height: 1.55; margin: 6px 0; }
  code { font-size: 9.5px; }
  ul { font-size: 10.5px; line-height: 1.55; margin: 6px 0 6px 18px; padding: 0; }
`;

function answerBlock(why) {
  return `<div class="answer">
    <div class="big">${esc(D.VERDICT.priceOfRecord)} &nbsp;=&nbsp; ${esc(D.VERDICT.annualCharge)}</div>
    <div class="sub">Month-to-month remains ${esc(D.VERDICT.monthToMonth)}.
    This was <strong>measured, not chosen</strong> &mdash; ${esc(why || D.VERDICT.why)}</div>
  </div>`;
}

function kpis() {
  return `<div class="kpi">
    <div><div class="n">${D.COUNTS.annualRows} / ${D.COUNTS.annualRows}</div>
      <div class="l">annual rows at $1,788</div></div>
    <div><div class="n zero">0</div><div class="l">rows anywhere at $1,700</div></div>
    <div><div class="n">${D.COUNTS.sourcesBefore} &rarr; ${D.COUNTS.sourcesAfter}</div>
      <div class="l">price sources: one, plus the unwired forecast</div></div>
    <div><div class="n">${D.COUNTS.mutations}/${D.COUNTS.mutations}</div><div class="l">mutations caught</div></div>
  </div>`;
}

function productionTable(only) {
  const src = only ? D.PRODUCTION.filter((r) => only.test(r.what)) : D.PRODUCTION;
  const rows = src.map((r) => `<tr${r.what.includes('TOTAL') ? ' class="total"' : ''}>
    <td>${esc(r.what)}</td>
    <td class="num${r.rows === 0 ? ' zero' : ''}">${r.rows}</td>
    <td class="num">${esc(r.amount)}</td>
    <td>${esc(r.note)}</td></tr>`).join('');
  return `<table class="t">
    <tr><th>what production holds</th><th>rows</th><th>each</th><th>note</th></tr>${rows}</table>`;
}

/**
 * The forecast gap, drawn. Two bars: what the pipeline currently claims, and what the same
 * pipeline is worth at the price this ticket settles. The difference is the decision.
 */
function forecastChart() {
  const claimed = 3386385;
  const atRealPrice = Math.round(claimed / 4500 * 1788);
  const w = 430;
  const scale = (v) => Math.round((v / claimed) * w);
  const money = (v) => '$' + v.toLocaleString('en-US');
  return `<svg width="100%" viewBox="0 0 ${w + 150} 104" style="margin:8px 0">
    <text x="0" y="12" font-size="9" fill="${TOKENS.MUTED}"
      font-family="sans-serif" letter-spacing="0.4">PIPELINE VALUE IN opportunity_scores, 25,270 SCORED LEADS</text>
    <rect x="0" y="22" width="${scale(claimed)}" height="22" rx="3" fill="${SEV.bad}"/>
    <text x="${scale(claimed) + 8}" y="38" font-size="11" font-weight="700"
      fill="${SEV.bad}" font-family="sans-serif">${money(claimed)}</text>
    <text x="4" y="37" font-size="9.5" fill="#fff" font-family="sans-serif">priced at $4,500, the retired offer</text>

    <rect x="0" y="56" width="${scale(atRealPrice)}" height="22" rx="3" fill="${SEV.ok}"/>
    <text x="${scale(atRealPrice) + 8}" y="72" font-size="11" font-weight="700"
      fill="${SEV.ok}" font-family="sans-serif">${money(atRealPrice)}</text>
    <text x="4" y="71" font-size="9.5" fill="#fff" font-family="sans-serif">priced at $1,788, the price of record</text>

    <text x="0" y="96" font-size="9.5" fill="${TOKENS.MUTED}" font-family="sans-serif">
      ${money(claimed - atRealPrice)} of the ${money(claimed)} is an artifact of a price no enrollment has ever paid.</text>
  </svg>`;
}

function criteriaTable(withEvidence) {
  const chip = (v) => (v === 'MET' ? 'met' : (/UNBLOCKED/.test(v) ? 'met' : 'part'));
  const rows = D.CRITERIA.map((c) => `<tr>
    <td class="num">${c.n}</td><td>${esc(withEvidence ? c.text : (c.short || c.text))}</td>
    <td><span class="chip ${chip(c.verdict)}">${esc(c.verdict)}</span></td>
    ${withEvidence ? `<td>${esc(c.evidence)}</td>` : ''}</tr>`).join('');
  return `<table class="t">
    <tr><th>#</th><th>done means</th><th></th>${withEvidence ? '<th>evidence</th>' : ''}</tr>
    ${rows}</table>`;
}

function buildVisual() {
  const body = `
  <h1>C10.2 &middot; The annual price of record is $1,788, not $1,700</h1>
  ${answerBlock('1,788 is 149 x 12. The plan and the system never held two candidate prices: '
    + 'the system holds one, unanimously, and the plan used a figure that exists in no row of '
    + 'the database and no file of the repository.')}
  ${kpis()}
  <h3>What production holds &mdash; every annual row ever written, not just the four active</h3>
  ${productionTable(/TOTAL|active annual|paid enrollments|\$1,700/)}
  <h3>The one number here that needs your decision</h3>
  <div class="chartwrap">${forecastChart()}</div>
  <h3>Done means</h3>
  ${criteriaTable(false)}
  <p style="font-size:9.5px;color:${TOKENS.MUTED};margin-top:6px">Measured ${esc(D.MEASURED_AT)}
  against production, read-only. The price of record is now
  <code>backend/src/services/membershipPrice.ts</code>; ${D.COUNTS.surfacesWired} of the
  ticket's 4 surfaces read it, and a CI guard fails the build when any of them stops agreeing.</p>`;
  return htmlDoc({ title: 'C10.2 - the annual price of record', css: css(), body });
}

function buildDocument() {
  const sources = D.SOURCES_BEFORE.map((s) => `<tr>
    <td class="num">${s.n}</td><td><code>${esc(s.source)}</code></td><td>${esc(s.surface)}</td>
    <td>${esc(s.said)}</td><td>${esc(s.linked)}</td></tr>`).join('');

  const base = D.RECURRING_BASE.map((r) => `<tr>
    <td>${esc(r.plan)}</td><td class="num">${r.active}</td><td class="num">${esc(r.each)}</td>
    <td>${esc(r.note)}</td></tr>`).join('');

  const ver = D.VERIFICATION.map((v) => `<tr>
    <td>${esc(v.gate)}</td><td>${esc(v.result)}</td></tr>`).join('');

  const flags = D.FLAGS.map((f) => `<div class="flag">
    <div class="sev">${esc(f.id)} &middot; ${esc(f.severity)}</div>
    <h4>${esc(f.title)}</h4><div>${esc(f.detail)}</div></div>`).join('');

  const checks = D.GUARD.checks.map((c) => `<li>${esc(c)}</li>`).join('');

  const body = `
  <h1>C10.2 &middot; Settle the annual price of record</h1>
  <p class="lede"><strong>The ticket framed this as two numbers in use, 1,700 and 1,788, with
  the forecast built on the one the system does not hold. That framing is right about the
  consequence and slightly wrong about the cause.</strong> There were never two prices. There
  was one price, recorded identically on every annual subscription the business has ever
  created, and a planning figure that appears in no row of the database and no file of the
  repository.</p>
  ${answerBlock()}
  ${kpis()}

  <h2>What production holds</h2>
  <p>The ticket cites the four active annual subscriptions. The true scope is wider and makes
  the answer firmer: <strong>every annual row ever written</strong> carries the same amount,
  including the ones that failed and the ones still pending.</p>
  ${productionTable()}
  <div class="box"><strong>Why $1,788 is a measurement and not a choice.</strong>
  $1,788 is $149 &times; 12. It is not typed anywhere any more; it is derived from the monthly
  rate, which is how the price is actually sold and quoted ("$149 a month, billed annually").
  So the question "which of the two is true" has a factual answer. The separate question
  &mdash; whether the price should <em>become</em> $1,700 &mdash; is a business decision and is
  flagged below, not taken here. Worth knowing before taking it: 1,700 is not a whole multiple
  of twelve, so adopting it would stop the annual plan being a monthly rate billed annually.</p>
  </div>

  <h2>Five sources, not four surfaces</h2>
  <p>The ticket names four surfaces. There were <strong>five independent sources</strong> of a
  membership price, and only two of them were linked by anything at all.</p>
  <table class="t">
    <tr><th>#</th><th>source</th><th>surface</th><th>what it said</th><th>linked to</th></tr>
    ${sources}</table>

  <h2>What changed</h2>
  <p>The rates now live in one dependency-free module,
  <code>backend/src/services/membershipPrice.ts</code>, and the annual charge is derived there
  rather than typed. The checkout, what Maya quotes, and the knowledge base's database seed all
  read it; none of the three contains a price to edit any more.</p>
  <p><strong>Why a leaf module and not an import of the billing plans.</strong>
  <code>admissionsPricing</code> could not import <code>subscriptionService</code>: billing
  reaches the email service through the enrollment service, and the email service reads
  <code>admissionsPricing</code>, so that import closes a cycle. That is precisely why the old
  contract test read the other file as <em>text</em> and regex-matched the number out of it. A
  module that imports nothing is importable from both sides, so the check became an identity
  rather than a coincidence &mdash; and the leaf property is itself asserted by a test, because
  the next person to add an import there would reintroduce the cycle for every consumer at once.</p>

  <h2>The guard, and why it is context-scoped</h2>
  <p><code>${esc(D.GUARD.file)}</code>, in the guards CI job, self-test first then the real run.
  It checks:</p>
  <ul>${checks}</ul>
  <div class="box"><strong>${esc(D.GUARD.whyContextScoped)}</strong></div>
  <p><strong>Proven, not asserted.</strong> ${D.GUARD.selfTestCases} self-test cases, and
  ${D.GUARD.mutations} mutations applied to the real repository one surface at a time &mdash; a
  literal rate put back into the plan table, Maya typing her own figure, the seed typing a
  price, the hub quoting $1,700, the hub quoting $4,500, the annual charge typed instead of
  derived, a third service growing its own price constant, Maya importing billing and
  recreating the cycle, and the canonical rate deleted from the hub entirely. All
  ${D.GUARD.mutations} were caught. The case that matters most is the control: with nothing
  mutated, the guard still passes, so it is not simply failing at everything.</p>

  <h2>The live recurring base, for whoever computes the target next</h2>
  ${base}
  <p>Read ${esc(D.MEASURED_AT)}. The distinction C10.3 draws matters here: four annual members
  are cash once, then nothing for twelve months.</p>

  <h2>Done means</h2>
  ${criteriaTable(true)}

  <h2>The forecast, which is the one surface this ticket did not wire</h2>
  ${forecastChart()}
  <p><code>revenueDashboardService</code> is already well governed &mdash; its own test bans a
  hardcoded price, bans a private price constant, requires reading the
  <code>price_per_enrollment</code> setting and forbids defaulting to 4,500. The accepted
  decision there is that a projection reads its price from a setting, and an unset setting makes
  the projection null rather than inventing a number. Hardwiring the membership price into it
  would break that decision.</p>
  <p><strong>What is wrong is the value behind the setting, not the plumbing.</strong> And that
  value is exactly what ESCALATION-002 is open on. So the guard reports the disagreement with
  the number attached and fails only if a <em>new</em> private price constant appears.</p>

  <h2>Verification actually run</h2>
  <table class="t"><tr><th>gate</th><th>result</th></tr>${ver}</table>

  <h2>Flags</h2>
  ${flags}

  <p style="font-size:9.5px;color:${TOKENS.MUTED};margin-top:14px">Measured ${esc(D.MEASURED_AT)}.
  All production access was read-only, SELECT statements only; nothing was written.
  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN.</p>`;
  return htmlDoc({ title: 'C10.2 - the annual price of record', css: css(), body });
}

module.exports = { buildVisual, buildDocument };
