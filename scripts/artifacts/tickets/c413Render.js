/**
 * C4.13 - renders the one-page summary and the full evidence audit.
 *
 * Both read c413Data, whose guards refuse a learner-outcome assertion, a defensible fact
 * with no basis, a live risk with no file citation, and any cost per person while burn
 * and revenue are unknown.
 */
const D = require('./c413Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .no{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
      font-weight:700;padding:2px 8px;border-radius:3px}
  .yes{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
       font-weight:700;padding:2px 8px;border-radius:3px}
  .num{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
       margin:8px 0}
  .ok{background:#f0fdf4;border-left:3px solid #2f7d32;padding:9px 11px;font-size:11px;
      margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * The sourcing ledger. Eight registry rows, side by side: the five that carry a funder's
 * whole argument and have no receipt, against the three that show what a sourced row
 * looks like in the same file.
 */
function sourcingChart(w = 940) {
  const rows = [
    ...D.RECOGNITIONS.map((r) => ({ id: r.row, src: r.src, ok: false })),
    ...D.SOURCING_CONTRAST.sourced.map((r) => ({ id: r.row, src: r.src, ok: true })),
  ];
  const rowH = 26;
  const h = rows.length * rowH + 34;
  const labelX = 96;
  const barX = 150;

  const body = rows.map((r, i) => {
    const y = 26 + i * rowH;
    const fill = r.ok ? '#e8f5e9' : '#fdecea';
    const stroke = r.ok ? '#2f7d32' : '#b3261e';
    const verdict = r.ok ? 'primary source on file' : 'NO PRIMARY SOURCE';
    return `<text x="${labelX}" y="${y + 13}" text-anchor="end" font-size="10.5"
        font-weight="700" fill="#334155">${esc(r.id)}</text>
      <rect x="${barX}" y="${y}" width="${w - barX - 16}" height="${rowH - 8}" rx="3"
        fill="${fill}" stroke="${stroke}"/>
      <text x="${barX + 10}" y="${y + 13}" font-size="10" fill="#334155">
        <tspan font-weight="700" fill="${stroke}">${verdict}</tspan>
        <tspan fill="#64748b">  &#183;  source field reads "${esc(r.src)}"</tspan></text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Five award registry rows carry no primary source; three Anthropic rows in
    the same registry carry a URL">
    <text x="${labelX}" y="14" text-anchor="end" font-size="9" font-weight="700"
      fill="#64748b">ROW</text>
    <text x="${barX}" y="14" font-size="9" font-weight="700" fill="#64748b">
      WHAT THE CLAIM REGISTRY HOLDS AS ITS SOURCE</text>
    ${body}
  </svg>`;
}

/** One page: the awards have no receipts, the spine claim is cut, and why both matter. */
function buildVisual() {
  const unsourced = D.assertRecognitionSourcingIsStated();
  const risks = D.assertEveryLiveRiskCitesItsLocation();
  const r = D.RECOMMENDATION;

  const body = `
    <h1 style="margin:0">For a funder the awards are the argument. None of the five has a
    receipt.</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C4.13 &#183;
    ${esc(D.AUDIENCE.name)} &#183; measured against production ${esc(D.AS_OF)}</p>

    <div class="bad" style="margin-top:9px"><strong>The brief cannot be written as
    specified.</strong> Its intended spine, that learners with no IT experience are doing
    well, is CUT: the background is derivable for 5.6% of learners by inference only, and
    every measure of "doing well" contradicts it. There is no employment, wage or
    placement data anywhere in the platform.</div>

    ${sourcingChart()}

    <div class="key"><strong>One award is blocked by our own governance and live on our
    own website.</strong> ${esc(D.LIVE_CONTRADICTION.row)} reads
    "${esc(D.LIVE_CONTRADICTION.registry)}" and
    <code>${esc(D.LIVE_CONTRADICTION.where.split(' and ')[0])}</code> ships
    "${esc(D.LIVE_CONTRADICTION.shipping)}" today. A funder checking our awards reaches
    the website before they reach us.</div>

    <div class="ok"><strong>What is genuinely strong, and unusual:</strong> 295 publicly
    openable evidence rows and 345 commit-verified learner stories across 29 projects. A
    funder can click and read them without asking us for anything.</div>

    <p style="font-size:11px;color:#64748b;margin:6px 0 2px"><strong>${esc(r.verdict)}.</strong>
    ${esc(r.theAsk)}</p>

    <p style="font-size:10.5px;font-weight:700;color:#334155;margin:8px 0 3px">
    Four things before the conversation. ${unsourced} award rows need a primary source,
    and ${risks} unsourced outcome claims are already live outside the company.</p>
    <ol style="font-size:10.5px;color:#334155;margin:0 0 0 18px;padding:0">
      ${r.before.map((x) => `<li style="margin:2px 0">${esc(x)}</li>`).join('')}
    </ol>`;

  return htmlDoc({ title: 'C4.13 funder impact brief', css: baseCss() + SHARED, body });
}

/** The full audit. */
function buildDocument() {
  D.assertNoOutcomeIsAsserted();
  D.assertEveryDefensibleFactHasABasis();
  D.assertNoCostPerPersonIsQuoted();
  const r = D.RECOMMENDATION;

  const body = `
    <h1>C4.13 &#183; The funder-facing impact brief, and why it is an audit instead</h1>
    <p class="lede" style="font-size:13px">The brief was to carry who we move, from what
    to what, with what verified evidence, at what cost per person. Three of those four
    cannot be evidenced today. This is the measurement, and what to do before the
    ${esc(D.AUDIENCE.name)} conversation.</p>

    <div class="bad"><strong>${esc(r.verdict)}.</strong> ${esc(r.instead)}</div>

    <h2>Who this is for, and what they will check</h2>
    <p><strong>${esc(D.AUDIENCE.name)}.</strong> ${esc(D.AUDIENCE.why)}</p>
    <p>${esc(D.AUDIENCE.problem)}</p>
    <div class="key">${esc(D.AUDIENCE.theyWillCheck)}</div>

    <h2>The recognitions, and the receipts that do not exist</h2>
    <p>${esc(D.SOURCING_CONTRAST.point)}</p>
    <table>
      <thead><tr><th style="width:10%">Row</th><th>Claim</th>
        <th style="width:17%">Source field</th><th style="width:13%">Primary source</th></tr></thead>
      <tbody>${D.RECOGNITIONS.map((x) => `<tr>
        <td><code>${esc(x.row)}</code></td><td>${esc(x.claim)}</td>
        <td>${esc(x.src)}</td>
        <td><span class="no">NONE</span></td></tr>`).join('')}
      ${D.SOURCING_CONTRAST.sourced.map((x) => `<tr>
        <td><code>${esc(x.row)}</code></td>
        <td style="color:#64748b">Anthropic row, shown for contrast</td>
        <td><code>${esc(x.src)}</code></td>
        <td><span class="yes">URL</span></td></tr>`).join('')}</tbody>
    </table>

    <div class="bad"><strong>${esc(D.LIVE_CONTRADICTION.row)} is blocked and shipping.</strong>
    The registry says "${esc(D.LIVE_CONTRADICTION.registry)}" The public site displays
    "${esc(D.LIVE_CONTRADICTION.shipping)}" at
    <code>${esc(D.LIVE_CONTRADICTION.where)}</code>.
    ${esc(D.LIVE_CONTRADICTION.why)}</div>

    <p><strong>On the XPRIZE line.</strong> ${esc(D.XPRIZE_NOTE)}</p>

    <h2>The spine claim: ${esc(D.SPINE.verdict)}</h2>
    <p>The ticket named the claim and the test: "${esc(D.SPINE.claim)}", quantify it or
    cut it. Both halves were measured against production and both fail.</p>
    ${D.SPINE.halves.map((h) => `<p><strong>"${esc(h.half)}".</strong>
      ${esc(h.finding)}</p>`).join('')}
    <div class="bad">${esc(D.SPINE.employment)}</div>
    <p>${esc(D.SPINE.alreadyKnown)}</p>

    <h2>Unsourced outcome claims that are already live</h2>
    <p>This is why the ticket is urgent rather than merely overdue. A funder brief would
    not be the first place we made an unevidenced outcome claim. It would be the fourth.</p>
    <table>
      <thead><tr><th style="width:26%">Claim</th><th style="width:24%">Where</th>
        <th>How it reaches people</th></tr></thead>
      <tbody>${D.LIVE_RISKS.map((x) => `<tr>
        <td><strong>${esc(x.what)}</strong><br>
          <span style="font-size:9.5px;color:#b3261e">${esc(x.severity)}</span></td>
        <td><code>${esc(x.where)}</code></td>
        <td>${esc(x.how)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>What we can put in front of a funder today</h2>
    <table>
      <thead><tr><th style="width:38%">Fact</th><th style="width:12%">Basis</th>
        <th>How it is established</th></tr></thead>
      <tbody>${D.DEFENSIBLE.map((x) => `<tr>
        <td><strong>${esc(x.fact)}</strong></td>
        <td><span class="yes">${esc(x.kind)}</span></td>
        <td>${esc(x.basis)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>Cost per person: ${esc(D.COST_PER_PERSON.verdict)}</h2>
    <p>${esc(D.COST_PER_PERSON.because)}</p>
    <p>${esc(D.COST_PER_PERSON.nearest)}</p>

    <h2>What to do before the conversation</h2>
    <ol>${r.before.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="ok"><strong>The ask itself.</strong> ${esc(r.theAsk)}</div>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}. All
    production figures read read-only. The data module refuses to publish a learner
    outcome, a defensible fact without a measurement or registry row behind it, a live
    risk without a file citation, or any cost per person while burn and revenue are
    recorded UNKNOWN.</p>`;

  return htmlDoc({
    title: 'C4.13 funder impact brief evidence audit',
    css: baseCss() + SHARED,
    body,
  });
}

module.exports = { buildVisual, buildDocument };
