/**
 * C9.1 - renders the one-page go/no-go and the full readiness report.
 *
 * Both read c91Data, whose guards refuse a hedged verdict, an unevidenced one, and a
 * recommendation that does not follow from the verdicts.
 */
const D = require('./c91Data');
const { esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .pass{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .fail{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .num{display:inline-block;background:#0f766e;color:#fff;font-size:9px;font-weight:700;
       padding:1px 6px;border-radius:3px;margin-right:5px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9.5px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .flag{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
        margin:8px 0}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/** Nine criteria as a scorecard. Red is not a gradient; there is no partial credit. */
function scorecard(w = 940) {
  const rowH = 29;
  const h = D.CRITERIA.length * rowH + 14;
  const left = 330;

  const rows = D.CRITERIA.map((c, i) => {
    const y = 8 + i * rowH;
    const pass = c.verdict === 'PASS';
    const fill = pass ? '#e8f5e9' : '#fdecea';
    const stroke = pass ? '#2f7d32' : '#b3261e';
    return `<rect x="${left}" y="${y}" width="${w - left - 14}" height="${rowH - 9}"
        rx="3" fill="${fill}" stroke="${stroke}"/>
      <text x="${left - 10}" y="${y + 14}" text-anchor="end" font-size="10.5"
        font-weight="600" fill="#334155">${c.n}. ${esc(c.name)}</text>
      <text x="${left + 10}" y="${y + 14}" font-size="10" font-weight="700"
        fill="${stroke}">${c.verdict}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Nine launch readiness criteria, four pass and five fail">${rows}</svg>`;
}

/** One page: the decision, the score, and the shortest path to changing it. */
function buildVisual() {
  const total = D.assertEveryVerdictIsBinary();
  const failed = D.assertRecommendationFollowsFromVerdicts();
  const r = D.RECOMMENDATION;
  // Spelled out from the data rather than typed into the sentence. This paragraph read
  // "Three of the five failures" while listing four of them, because the count was prose
  // and the list was generated - the two drifted the moment a criterion moved path.
  const word = (n) => ['none', 'one', 'two', 'three', 'four', 'five', 'six',
    'seven', 'eight', 'nine'][n] || String(n);
  const Word = (n) => word(n).charAt(0).toUpperCase() + word(n).slice(1);

  const body = `
    <h1 style="margin:0">Launch readiness: ${esc(r.verdict)}</h1>
    <p style="font-size:11.5px;color:#64748b;margin:3px 0 0">C9.1 &middot;
    ${total - failed} of ${total} criteria pass &middot; pass or fail, no partial credit
    &middot; evidence gathered ${esc(D.AS_OF)}, figures re-read ${esc(D.RE_READ.at)}</p>

    <div class="bad" style="margin-top:9px"><strong>${esc(r.verdict)}.</strong>
    ${esc(r.because)}</div>

    ${scorecard()}

    <div class="flag"><strong>The critical path runs through decisions, not through
    building.</strong> ${Word(D.CRITICAL_PATH.blockedOnAli.length)} of the ${word(failed)}
    failures are waiting on Ali
    (${D.CRITICAL_PATH.blockedOnAli.map((x) => esc(x)).join('; ')})${
      D.CRITICAL_PATH.blockedOnConfiguration.length
        ? ', ' + word(D.CRITICAL_PATH.blockedOnConfiguration.length)
          + ' on a configuration row that nobody has created'
        : ''}, and
    ${word(D.CRITICAL_PATH.blockedOnBuild.length)} on instrumentation.
    ${esc(r.smallestPathToGo)}</div>

    <p style="font-size:11px;color:#64748b;margin-top:4px"><strong>Why the asymmetry
    matters:</strong> ${esc(r.cost)}</p>`;

  return htmlDoc({ title: 'C9.1 launch readiness', css: baseCss() + SHARED, body });
}

/** The full report: every criterion, its evidence, and what it would take to pass. */
function buildDocument() {
  const total = D.CRITERIA.length;
  const failed = D.CRITERIA.filter((c) => c.verdict === 'FAIL');
  const r = D.RECOMMENDATION;
  const m = D.MEASURED;

  const body = `
    <h1>C9.1 &middot; Launch readiness review</h1>
    <p class="lede" style="font-size:13px">Nine criteria, pass or fail, no partial
    credit. The recommendation is <strong>${esc(r.verdict)}</strong>:
    ${total - failed.length} pass and ${failed.length} fail.</p>

    <div class="bad"><strong>${esc(r.verdict)}.</strong> ${esc(r.because)}</div>

    <h2>The scorecard</h2>
    <table>
      <thead><tr><th style="width:6%">#</th><th style="width:28%">Criterion</th>
        <th style="width:10%">Verdict</th><th>Why</th></tr></thead>
      <tbody>${D.CRITERIA.map((c) => `<tr>
        <td><span class="num">${c.n}</span></td>
        <td><strong>${esc(c.name)}</strong></td>
        <td><span class="${c.verdict === 'PASS' ? 'pass' : 'fail'}">${c.verdict}</span></td>
        <td>${esc(c.evidence)}</td></tr>`).join('')}</tbody>
    </table>

    <h2>Each criterion in full</h2>
    ${D.CRITERIA.map((c) => `
      <h3><span class="num">${c.n}</span>${esc(c.name)}
        <span class="${c.verdict === 'PASS' ? 'pass' : 'fail'}">${c.verdict}</span></h3>
      <p><strong>Evidence.</strong> ${esc(c.evidence)}</p>
      ${c.nuance ? `<p><strong>Worth knowing.</strong> ${esc(c.nuance)}</p>` : ''}`).join('')}

    <h2>Where the critical path actually runs</h2>
    <p>This is the part worth acting on. Of the ${failed.length} failures, only one is a
    build.</p>
    <table>
      <thead><tr><th style="width:30%">Blocked on</th><th>Criteria</th></tr></thead>
      <tbody>
        <tr><td><strong>A decision only Ali can make</strong></td>
          <td>${D.CRITICAL_PATH.blockedOnAli.map((x) => esc(x)).join('<br>')}</td></tr>
        <tr><td><strong>A configuration nobody has created</strong></td>
          <td>${D.CRITICAL_PATH.blockedOnConfiguration.length
            ? D.CRITICAL_PATH.blockedOnConfiguration.map((x) => esc(x)).join('<br>')
            : '<em>None. The governance config this review called for was created by '
              + 'C0.12 on ' + esc(D.RE_READ.at) + '.</em>'}</td></tr>
        <tr><td><strong>Engineering</strong></td>
          <td>${D.CRITICAL_PATH.blockedOnBuild.map((x) => esc(x)).join('<br>')}</td></tr>
      </tbody>
    </table>
    <p><strong>${esc(r.smallestPathToGo)}</strong></p>

    <h2>What was measured, ${esc(D.AS_OF)}</h2>
    <table><tbody>
      <tr><td style="width:44%">Organizations typed <code>strategic_account</code></td>
        <td>${m.strategicAccounts}</td></tr>
      <tr><td>Campaign governance configs</td><td>${m.campaignGovernanceConfigs}</td></tr>
      <tr><td>Campaigns in status "active"</td><td>${m.activeCampaigns}</td></tr>
      <tr><td>Revenue opportunities</td><td>${m.revenueOpportunities}</td></tr>
      <tr><td>Delivery contracts</td><td>${m.deliveryContracts}</td></tr>
      <tr><td>Leads linked to an account</td><td>${m.leadsLinkedToAnAccount}</td></tr>
      <tr><td>Website check control</td><td>${esc(m.websiteControl)}</td></tr>
    </tbody></table>

    <h2>How this review was conducted, and where it disagrees with the board</h2>
    <ul>
      <li><strong>A closed ticket is not evidence that a thing works.</strong> A closed
      DESIGN ticket proves a document was approved. Every criterion here was checked
      against production or a rendered page where that was possible.</li>
      <li><strong>An open ticket is not evidence that work is unfinished.</strong> C5.10,
      C8.2 and C8.4 are open to-dos whose code has merged; they are open because a human
      closes these. This review counts the code, not the checkbox.</li>
      <li><strong>The website could not be verified with a status code.</strong> The site
      is a React shell returning HTTP 200 and the same 2,897 bytes for every path,
      including a nonsense one. It was verified by rendering each page in a browser, with
      that nonsense path as the control - it renders a real 404, which is what makes the
      two positive results mean anything.</li>
      <li><strong>One flag, recorded rather than scored.</strong> The live commercial
      navigation uses "Start Free" as its primary call to action, and this initiative's
      own rule is never to advertise that word under TWC 807.172(d). It is NOT an
      unguarded violation: <code>frontendCopyBaseline.ts</code> carries
      <code>PublicHeaderV2.tsx: 1</code>, so it is counted, frozen and shrink-only. It
      does not change any verdict here. It is recorded because outreach drives traffic to
      exactly that navigation, and a known exception is worth re-deciding at the moment
      you start pointing buyers at it.</li>
    </ul>

    <p style="font-size:11px;color:#64748b;margin-top:22px">Prepared ${esc(D.AS_OF)}.
    Verdicts are binary by construction: the data module has no PARTIAL value and its
    build refuses a recommendation that does not follow from the verdicts.</p>`;

  return htmlDoc({ title: 'C9.1 launch readiness review', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
