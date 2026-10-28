/**
 * C6.13 - renders the one-page scorecard and the full target-list document.
 *
 * Both read c613Data through c613Criteria, whose guards refuse an unsourced commitment,
 * an unproven negative, a pattern-guessed address, or a disqualified company quietly
 * dropped from the ten.
 *
 * ## Why the scorecard is a matrix and not a table of ticks
 *
 * The ten do not sort into pass and fail. Each carries four independent checks that
 * disagree with each other: a company can have the strongest CEO quote on the list and
 * still fail the disqualifier (CNO), or clear every disqualifier and have no requisition
 * at all (Lindsay). A matrix shows the disagreement, which IS the finding. A single
 * pass/fail column would have to pick one check to privilege and would hide the rest.
 *
 * The last two columns are deliberately both present. Column four is the disqualifier as
 * Ali settled it on 2026-10-28; column five is the L&D finding underneath it, which the
 * refinement did not change. Two companies read "clear" in one and "present" in the
 * other, and that disagreement is the most important thing on the page.
 *
 * Status colors only - green/amber/red/gray carry state, never series identity, and
 * every cell is labeled as well as colored so the grid survives a mono print and a
 * colorblind reader.
 */
const D = require('./c613Data');
const C = require('./c613Criteria');
const { esc, baseCss, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SEV = TOKENS.SEV;

const SHARED = `
  .lede{font-size:11pt;line-height:1.45;margin:0 0 10px}
  .q{font-style:italic;color:#1f2937;border-left:3px solid var(--cherry);
     padding:4px 0 4px 10px;margin:5px 0 6px;font-size:9.5pt}
  .src{font-size:7.6pt;color:var(--muted);word-break:break-all}
  .pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:7.6pt;
        font-weight:700;color:#fff;white-space:nowrap}
  .co{border:1px solid var(--border);border-radius:6px;padding:9px 11px;margin:0 0 9px;
      page-break-inside:avoid}
  .co h3{margin:0 0 2px;font-size:11pt}
  .co .sub{font-size:8.2pt;color:var(--muted);margin-bottom:5px}
  .warn{background:#fdf3f2;border-left:3px solid ${SEV.bad};padding:7px 10px;
        font-size:8.6pt;margin:5px 0}
  .ok{background:#f3f9f3;border-left:3px solid ${SEV.ok};padding:7px 10px;
      font-size:8.6pt;margin:5px 0}
`;

const chip = (text, color) => `<span class="pill" style="background:${color}">${esc(text)}</span>`;

/** Status color for a verdict string, defaulting to gray rather than guessing. */
function sev(v) {
  if (v === 'YES' || v === 'MET' || v === 'PASSES' || v === 'CLEAR') return SEV.ok;
  if (v === 'DISQUALIFIED') return SEV.bad;
  if (v === 'WATCH' || v === 'UNRESOLVED') return SEV.watch;
  return SEV.none;
}

/* ------------------------------------------------------------------ scorecard */

/** Small word map so the headline can be computed without reading "9 Clean Targets". */
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten'];
const word = (n) => WORDS[n] || String(n);

/**
 * What each column shows for one company. Returns a severity key and a cell label, so
 * the fill and the text can never drift apart.
 *
 * The `ld` column is the only one whose worst state is amber rather than red. It reports
 * a finding, not a failure: since the refinement an L&D organization is a reason to
 * watch a company, not a reason to cut it.
 */
function cellFor(k, co) {
  if (k === 'commitment') {
    return { v: 'YES', txt: co.commitment.who === co.ceo.name ? 'CEO' : 'company' };
  }
  if (k === 'req') {
    return { v: co.req.verdict, txt: co.req.verdict === 'YES' ? 'open' : 'none' };
  }
  if (k === 'ai') {
    const v = co.disq.aiLeader.verdict;
    return { v, txt: v === 'CLEAR' ? 'clear' : 'watch' };
  }
  if (k === 'capability') {
    const v = co.disq.capability.verdict;
    return { v, txt: v === 'PASSES' ? 'clear' : (v === 'DISQUALIFIED' ? 'FAILS' : 'unknown') };
  }
  const v = co.disq.ld.verdict;
  if (v === 'DISQUALIFIED') return { v: 'WATCH', txt: 'present' };
  if (v === 'UNRESOLVED') return { v: 'UNRESOLVED', txt: 'unclear' };
  return { v: 'PASSES', txt: 'none' };
}

/**
 * Ten rows, five columns of state. Cells are labeled as well as colored.
 */
function matrix(w = 980) {
  const cols = [
    { k: 'commitment', label: 'Public AI commitment' },
    { k: 'req', label: 'Open AI / data req' },
    { k: 'ai', label: 'No AI leader in post' },
    { k: 'capability', label: 'No enterprise capability org' },
    { k: 'ld', label: 'In-house L&D org' },
  ];
  const labelW = 196;
  const cellW = (w - labelW) / cols.length;
  const rowH = 21;
  const headH = 30;
  const h = headH + D.COMPANIES.length * rowH + 4;

  const head = cols.map((c, i) => {
    const x = labelW + i * cellW;
    const words = c.label.split(' ');
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(' ');
    const l2 = words.slice(mid).join(' ');
    return `<text x="${x + cellW / 2}" y="14" font-size="8" font-weight="700"
      fill="#475569" text-anchor="middle">${esc(l1)}</text>
      <text x="${x + cellW / 2}" y="25" font-size="8" font-weight="700"
      fill="#475569" text-anchor="middle">${esc(l2)}</text>`;
  }).join('');

  const rows = D.COMPANIES.map((co, r) => {
    const y = headH + r * rowH;
    const cells = cols.map((c, i) => {
      const { v, txt } = cellFor(c.k, co);
      const col = sev(v);
      const x = labelW + i * cellW;
      return `<rect x="${x + 2}" y="${y + 3}" width="${cellW - 4}" height="${rowH - 6}"
          rx="3" fill="${col}" opacity="${v === 'DISQUALIFIED' ? 1 : 0.14}"/>
        <text x="${x + cellW / 2}" y="${y + rowH / 2 + 3}" font-size="8.4"
          font-weight="700" text-anchor="middle"
          fill="${v === 'DISQUALIFIED' ? '#fff' : col}">${esc(txt)}</text>`;
    }).join('');
    const failed = co.disq.capability.verdict === 'DISQUALIFIED';
    return `<text x="0" y="${y + rowH / 2 + 3}" font-size="8.8"
        font-weight="${failed ? 700 : 600}"
        fill="${failed ? SEV.bad : '#334155'}">${esc(co.name)}</text>${cells}`;
  }).join('');

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg"
    font-family="Segoe UI, system-ui, sans-serif">${head}${rows}</svg>`;
}

function tiles() {
  const t = [
    { n: D.CAMPAIGN.enrolled, k: 'enrolled, verified' },
    { n: C.CLEAN.length, k: 'clear every check' },
    { n: C.DISQUALIFIED.length, k: 'disqualified' },
    { n: C.OVERTURNED.length, k: 'returned, on watch' },
    { n: C.WITH_REQ.length, k: 'have an open req' },
    { n: D.CAMPAIGN.touchpoints, k: 'messages sent' },
  ];
  return '<div class="cards">' + t.map((x) => `<div class="card">
    <div class="n">${x.n}</div><div class="k">${esc(x.k)}</div></div>`).join('') + '</div>';
}

function buildVisual() {
  const cut = C.DISQUALIFIED.map((c) => c.name).join(', ');
  const back = C.OVERTURNED.map((c) => c.name).join(' and ');
  const body = `
  <h1>Ten CEOs, ${esc(word(C.CLEAN.length))} Clean Targets</h1>
  <div class="meta">C6.13 &middot; boards read ${esc(D.OBSERVED)} &middot; disqualifier
    settled ${esc(D.DISQ_LD.decidedOn)} &middot; campaign ${esc(D.CAMPAIGN.id)}
    &middot; nothing sent</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">All ten are enrolled with Apollo-verified addresses and nothing
      has been sent. The L&amp;D disqualifier now tests whether a company already builds
      capability at enterprise scale, not whether it trains anyone: ${esc(cut)} is cut,
      ${esc(back)} return on watch, and ${esc(word(C.CLEAN.length).toLowerCase())} clear
      every check.</div>
  </div>

  ${tiles()}

  <figure>${matrix()}</figure>

  <div class="warn" style="font-size:8.4pt"><b>The two returned companies keep their
    finding.</b> Tennant runs a staffed Talent Development team and Avista runs the Jack
    Stewart Training Center with eleven apprenticeships. Both are real, both are
    unchanged, and both carry no AI content &mdash; leadership, trades and product
    training. The refined test reads that as a buying habit with a budget line already
    in place. If either declines with &ldquo;we will do this internally&rdquo;, the
    literal reading was right.</div>

  <div class="note" style="font-size:8.4pt"><b>Still yours.</b> The order of approach
    &mdash; the other half of what this ticket reserves to you. No AI curriculum was
    found at any of the ten, so the disqualifier tests capacity to build rather than
    the word &ldquo;AI&rdquo;; it still cuts one. All four activation blockers remain
    closed, so nothing sends.</div>
  `;
  return htmlDoc({ title: 'C6.13 Target List', css: baseCss() + SHARED, body });
}

/* ------------------------------------------------------------------- document */

function companyBlock(co) {
  const m = co.commitment;
  const ld = co.disq.ld;
  const cap = co.disq.capability;
  const ai = co.disq.aiLeader;
  const emp = co.employees;
  const attributed = m.who === co.ceo.name;

  const reqLine = co.req.verdict === 'YES'
    ? `<b>Open requisition:</b> ${esc(co.req.title)}${co.req.location ? ' &middot; '
      + esc(co.req.location) : ''}. Site-displayed date ${esc(co.req.displayedDate || 'none')}.
      <span class="src">${esc(co.req.url)}</span><br><span class="src">${esc(co.req.coverage)}</span>`
    : `<b>No open AI or data requisition.</b> ${esc(co.req.coverage)}
      <br><span class="src">Negative validated with a live control: ${esc(co.req.control)}
      &mdash; ${esc(co.req.controlUrl)}</span>`;

  const badge = cap.verdict === 'DISQUALIFIED' ? 'DISQUALIFIED'
    : (cap.verdict === 'UNRESOLVED' ? 'UNRESOLVED'
      : (cap.overturnedBy ? 'CLEARS - ON WATCH' : 'CLEARS BOTH'));

  return `<div class="co">
    <h3>${co.rank}. ${esc(co.name)}
      ${chip(badge, cap.overturnedBy ? SEV.watch : sev(cap.verdict))}</h3>
    <div class="sub">${esc(co.sector)} &middot; ${esc(co.ceo.name)}, ${esc(co.ceo.title)}
      &middot; ${esc(co.ceo.email)} (Apollo ${esc(co.ceo.emailStatus)})
      &middot; lead ${co.leadId}</div>

    <div class="q">&ldquo;${esc(m.quote)}&rdquo;</div>
    <p style="font-size:8.6pt;margin:0 0 5px">
      ${attributed ? '<b>' + esc(m.who) + '</b>, ' + esc(m.whoTitle)
        : '<b>' + esc(m.who) + '</b> &mdash; ' + esc(m.whoTitle)}
      &middot; ${esc(m.date)} &middot; ${esc(m.sourceType)}<br>
      <span class="src">${esc(m.url)}</span></p>
    ${m.caveat ? `<div class="warn">${esc(m.caveat)}</div>` : ''}
    ${m.strongerButRiskier ? `<div class="note" style="font-size:8.4pt">${esc(m.strongerButRiskier)}</div>` : ''}

    <p style="font-size:8.6pt;margin:5px 0">${reqLine}</p>

    <p style="font-size:8.6pt;margin:5px 0"><b>Headcount:</b> ${esc(emp.count)}
      ${emp.asOf !== 'undated' ? 'as of ' + esc(emp.asOf) : '(undated)'}
      &middot; ${esc(emp.sourceType)}${emp.caveat ? ' &mdash; ' + esc(emp.caveat) : ''}</p>

    <p style="font-size:8.6pt;margin:5px 0"><b>AI leader (${esc(ai.verdict)}):</b>
      ${esc(ai.detail)}</p>

    <div class="${cap.verdict === 'DISQUALIFIED' ? 'warn' : (cap.overturnedBy ? 'note' : 'ok')}">
      <b>Disqualifier &mdash; enterprise capability (${esc(cap.verdict)}):</b>
      ${esc(cap.detail)}
      ${cap.overturnedBy ? '<br><br><b>Overturned by:</b> ' + esc(cap.overturnedBy) : ''}
      ${cap.watch ? '<br><br><b>Standing watch:</b> ' + esc(cap.watch) : ''}
      ${cap.evidenceLimit ? '<br><br><b>Limit of the evidence:</b> '
        + esc(cap.evidenceLimit) : ''}
      ${cap.residualRisk ? '<br><br><b>Residual risk:</b> ' + esc(cap.residualRisk) : ''}</div>

    <p style="font-size:8.6pt;margin:5px 0"><b>Underlying L&amp;D finding
      (${esc(ld.verdict)} under the ticket&rsquo;s literal wording):</b> ${esc(ld.detail)}
      ${ld.settled ? '<br><br><b>Settled:</b> ' + esc(ld.settled) : ''}
      ${ld.overturns ? '<br><br><b>Overturns an earlier pass:</b> ' + esc(ld.overturns) : ''}
      ${ld.nuance ? '<br><br><b>Nuance:</b> ' + esc(ld.nuance) : ''}
      ${ld.residualRisk ? '<br><br><b>Residual risk:</b> ' + esc(ld.residualRisk) : ''}
      ${ld.whatWouldSettleIt ? '<br><br><b>What would settle it:</b> '
        + esc(ld.whatWouldSettleIt) : ''}</p>

    ${co.note ? `<p style="font-size:8.6pt;margin:5px 0 0"><b>Note:</b> ${esc(co.note)}</p>` : ''}
  </div>`;
}

function criteriaTable() {
  return `<table><thead><tr><th style="width:26px">#</th><th>Acceptance criterion</th>
    <th style="width:150px">Verdict</th></tr></thead><tbody>`
    + C.criteria().map((c) => `<tr><td>${c.n}</td>
      <td>${esc(c.text)}<br><span class="src">${esc(c.evidence)}</span>
      ${c.note ? '<br><span class="src"><b>Not claimed:</b> ' + esc(c.note) + '</span>' : ''}
      ${c.decision ? '<br><span class="src"><b>Decision:</b> ' + esc(c.decision) + '</span>' : ''}</td>
      <td>${chip(c.verdict, c.verdict === 'MET' ? SEV.ok : SEV.watch)}</td></tr>`).join('')
    + '</tbody></table>';
}

function buildDocument() {
  const body = `
  <h1>C6.13 &mdash; The Ten-Company Target List</h1>
  <div class="meta">CEO-direct motion &middot; campaign ${esc(D.CAMPAIGN.id)} &middot;
    careers boards and ATS enumerated ${esc(D.OBSERVED)} &middot; nothing sent</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">Ten CEOs are named and enrolled, every address Apollo-verified
      and none guessed. The L&amp;D disqualifier, which had never properly been run,
      failed three under the ticket&rsquo;s literal wording; it was refined on
      ${esc(D.DISQ_LD.decidedOn)} to test enterprise capability building rather than any
      training function. ${esc(C.DISQUALIFIED.map((c) => c.name).join(', '))} is cut,
      ${esc(C.OVERTURNED.map((c) => c.name).join(' and '))} return carrying their
      findings, and ${esc(word(C.CLEAN.length).toLowerCase())} clear every check.</div>
  </div>

  <h2>What landed in production</h2>
  <p class="lede">The ten were enrolled against the draft campaign as lead ids
    ${esc(D.CAMPAIGN.leadIdRange)}, and must_have item 2 was reworded in the same run.
    The enrollment script re-asserted all four activation blockers against the live row
    before writing and would have refused had any opened. Verified read-only
    afterwards: status <code>${esc(D.CAMPAIGN.status)}</code>,
    qa_status <code>${esc(D.CAMPAIGN.qaStatus)}</code>,
    activation_gate <code>${esc(JSON.stringify(D.CAMPAIGN.activationGate))}</code>,
    budget_spent ${esc(D.CAMPAIGN.budgetSpent)} of ${esc(D.CAMPAIGN.budgetTotal)},
    ${D.CAMPAIGN.touchpoints} touchpoints, ${D.CAMPAIGN.responses} responses.</p>

  <h2>The criterion that could not survive</h2>
  <p class="lede">must_have item 2 read <i>&ldquo;An AI engineering req open longer than
    90 days&rdquo;</i>, and the ticket called the stale req the sharpest filter in the
    whole strategy. It is not verifiable from outside. Career sites refresh the
    displayed posted date: the same Tennant posting read &ldquo;Sep 28, 2026&rdquo; in a
    search snippet and &ldquo;Oct 27, 2026&rdquo; on the live page, hours apart. A
    criterion nothing can honestly satisfy makes every qualification claim against it
    false, so it was reworded on ${esc(D.OBSERVED)} to record the date <b>we</b> observed
    the requisition &mdash; a date that is ours, is honest, and accumulates real
    duration evidence on re-observation.</p>
  <p class="lede">Screened against the new wording, ${C.WITH_REQ.length} of the ten carry
    an open AI or data requisition. The other six do not, and each of those negatives
    rests on a complete board enumeration with a named live control posting retrieved
    from the same board; two also carry an expired requisition returning HTTP 410,
    proving the board distinguishes live from dead rather than serving a catch-all page.
    The criterion reads <i>&ldquo;commitment <b>or</b> req&rdquo;</i>, so a missing
    requisition does not disqualify &mdash; it just means the commitment carries the row
    alone.</p>

  <h2>The disqualifier that had never been run</h2>
  <p class="lede">The ticket names two disqualifiers and only the AI-leadership one had
    been checked. Running the second &mdash; <i>&ldquo;${esc(D.DISQ_LD.replaced)}&rdquo;</i>
    &mdash; failed CNO Financial, Tennant and Avista, and could not be resolved for
    Smile Brands. The problem was not the finding but the test: Tennant is the
    best-fitting company on the list by every other signal, and it failed for running a
    Talent Development team that teaches leadership and product skills to a
    cleaning-equipment field force.</p>
  <p class="lede">On ${esc(D.DISQ_LD.decidedOn)} the wording was settled as:
    <i>&ldquo;${esc(D.DISQ_LD.wording)}&rdquo;</i></p>
  <p class="lede"><b>The wording is about scale deliberately, and here is why.</b>
    ${esc(D.DISQ_LD.evidenceLimit)} A disqualifier that excludes nobody is decoration
    presented as diligence, so the build now fails outright if the refined wording ever
    clears all ten. It currently cuts ${C.DISQUALIFIED.length} of ${D.COMPANIES.length}.</p>
  <p class="lede">The two returned companies keep their findings in full. Their L&amp;D
    entries below are unchanged from the day they were disqualified, each carries the
    record of the overturn, and each carries a standing watch &mdash; the build refuses
    to render a returned company that has lost either one.</p>

  <h2>Acceptance criteria</h2>
  ${criteriaTable()}

  <h2 class="pagebreak">The ten</h2>
  ${D.COMPANIES.map(companyBlock).join('')}

  <h2>What this document does not claim</h2>
  <ul>
    <li><b>No requisition age.</b> Displayed posted dates are reported as displayed and
      are not evidence of how long a seat has been open.</li>
    <li><b>No headcount for Smile Brands.</b> No company-published figure exists;
      aggregators span 3,056 to 10,000. Every estimate is inside the target band, which
      is the only claim made.</li>
    <li><b>No named AI speaker for Horace Mann.</b> None exists. EDGAR full-text returns
      four Horace Mann filings ever containing &ldquo;artificial intelligence&rdquo;, none
      quoting a person; every 8-K earnings release from Q3 2025 to Q2 2026 contains zero
      occurrences; so do both 2026 call transcripts.</li>
    <li><b>No verdict on whether Smile Brands has an L&amp;D function.</b> &ldquo;Smile
      University&rdquo; exists by name but every sourceable detail points to dentist
      continuing education, and LinkedIn was unreachable from the research environment.
      The refined disqualifier clears Smile Brands either way, so the question is no
      longer decision-relevant &mdash; but it is open, not answered, and one LinkedIn
      people-search should close it before the company is approached.</li>
    <li><b>No claim that any company runs an AI-capability program today.</b> None was
      found at any of the ten. CNO is disqualified on demonstrated capacity to build,
      not on an AI curriculum already in place.</li>
    <li><b>No recommended order.</b> The ticket reserves it.</li>
  </ul>
  `;
  return htmlDoc({ title: 'C6.13 Target List', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
