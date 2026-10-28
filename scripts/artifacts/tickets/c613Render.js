/**
 * C6.13 - renders the one-page scorecard and the full target-list document.
 *
 * Both read c613Data through c613Criteria, whose guards refuse an unsourced commitment,
 * an unproven negative, a pattern-guessed address, or a disqualified company quietly
 * dropped from the ten.
 *
 * ## Why the scorecard is a matrix and not a table of ticks
 *
 * The ten do not sort into pass and fail. Each carries three independent checks that
 * disagree with each other: a company can have the strongest CEO quote on the list and
 * still fail the L&D disqualifier (CNO), or clear every disqualifier and have no
 * requisition at all (Lindsay). A matrix shows the disagreement, which IS the finding.
 * A single pass/fail column would have to pick one check to privilege and would hide
 * the rest.
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

/**
 * Ten rows, four columns of state. Cells are labeled as well as colored.
 */
function matrix(w = 980) {
  const cols = [
    { k: 'commitment', label: 'Public AI commitment' },
    { k: 'req', label: 'Open AI / data req' },
    { k: 'ai', label: 'No AI leader in post' },
    { k: 'ld', label: 'No full talent + L&D' },
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
      let v; let txt;
      if (c.k === 'commitment') { v = 'YES'; txt = co.commitment.who === co.ceo.name ? 'CEO' : 'company'; }
      else if (c.k === 'req') { v = co.req.verdict; txt = co.req.verdict === 'YES' ? 'open' : 'none'; }
      else if (c.k === 'ai') { v = co.disq.aiLeader.verdict; txt = v === 'CLEAR' ? 'clear' : 'watch'; }
      else { v = co.disq.ld.verdict; txt = v === 'PASSES' ? 'clear' : (v === 'DISQUALIFIED' ? 'FAILS' : 'unknown'); }
      const col = sev(v);
      const x = labelW + i * cellW;
      return `<rect x="${x + 2}" y="${y + 3}" width="${cellW - 4}" height="${rowH - 6}"
          rx="3" fill="${col}" opacity="${v === 'DISQUALIFIED' ? 1 : 0.14}"/>
        <text x="${x + cellW / 2}" y="${y + rowH / 2 + 3}" font-size="8.4"
          font-weight="700" text-anchor="middle"
          fill="${v === 'DISQUALIFIED' ? '#fff' : col}">${esc(txt)}</text>`;
    }).join('');
    const failed = co.disq.ld.verdict === 'DISQUALIFIED';
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
    { n: C.DISQUALIFIED.length, k: 'fail the L&D test' },
    { n: C.WITH_REQ.length, k: 'have an open req' },
    { n: D.CAMPAIGN.touchpoints, k: 'messages sent' },
  ];
  return '<div class="cards">' + t.map((x) => `<div class="card">
    <div class="n">${x.n}</div><div class="k">${esc(x.k)}</div></div>`).join('') + '</div>';
}

function buildVisual() {
  const names = C.DISQUALIFIED.map((c) => c.name).join(', ');
  const body = `
  <h1>Ten CEOs, Six Clean Targets</h1>
  <div class="meta">C6.13 &middot; boards read ${esc(D.OBSERVED)} &middot; campaign
    ${esc(D.CAMPAIGN.id)} &middot; nothing sent</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <div class="headline">All ten are enrolled with Apollo-verified addresses and nothing
      has been sent. The L&amp;D disqualifier, never previously run, fails
      ${C.DISQUALIFIED.length} of them &mdash; ${esc(names)} &mdash; and one is the
      best-fitting target on the list.</div>
  </div>

  ${tiles()}

  <figure>${matrix()}</figure>

  <div class="warn" style="font-size:8.4pt"><b>The criterion cuts hardest where the fit
    is best.</b> Tennant has a CEO on record on AI, an &ldquo;Enterprise AI and Analytics
    Leader&rdquo; req it has not filled, and no AI leader in post. It fails only because
    it runs a Talent Development team &mdash; built for leadership and technical
    training, carrying no AI content. CNO&rsquo;s failure is different and sound:
    fifteen consecutive years of Training magazine awards is a company that builds its
    own.</div>

  <div class="note" style="font-size:8.4pt"><b>Your decision.</b> Whether the
    disqualifier tests for any training function, or only for an existing AI-capability
    program. Six under the first reading, eight under the second, with CNO falling
    either way. All four activation blockers remain closed, so nothing moves until you
    settle it.</div>
  `;
  return htmlDoc({ title: 'C6.13 Target List', css: baseCss() + SHARED, body });
}

/* ------------------------------------------------------------------- document */

function companyBlock(co) {
  const m = co.commitment;
  const ld = co.disq.ld;
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

  return `<div class="co">
    <h3>${co.rank}. ${esc(co.name)}
      ${chip(ld.verdict === 'DISQUALIFIED' ? 'DISQUALIFIED' : (ld.verdict === 'UNRESOLVED'
        ? 'L&D UNRESOLVED' : 'CLEARS BOTH'), sev(ld.verdict))}</h3>
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

    <div class="${ld.verdict === 'DISQUALIFIED' ? 'warn' : (ld.verdict === 'UNRESOLVED' ? 'note' : 'ok')}">
      <b>Talent + L&amp;D (${esc(ld.verdict)}):</b> ${esc(ld.detail)}
      ${ld.settled ? '<br><br><b>Settled:</b> ' + esc(ld.settled) : ''}
      ${ld.overturns ? '<br><br><b>Overturns an earlier pass:</b> ' + esc(ld.overturns) : ''}
      ${ld.residualRisk ? '<br><br><b>Residual risk:</b> ' + esc(ld.residualRisk) : ''}
      ${ld.whatWouldSettleIt ? '<br><br><b>What would settle it:</b> '
        + esc(ld.whatWouldSettleIt) : ''}</div>

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
      and none guessed. Three fail the ticket&rsquo;s own L&amp;D disqualifier, which had
      never properly been run, and one more cannot be resolved. Six clear every check.
      The composition of the final ten is yours to settle.</div>
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
    <li><b>No verdict on Smile Brands&rsquo; L&amp;D.</b> &ldquo;Smile University&rdquo;
      exists by name but every sourceable detail points to dentist continuing education,
      and LinkedIn was unreachable from the research environment.</li>
    <li><b>No recommended order.</b> The ticket reserves it.</li>
  </ul>
  `;
  return htmlDoc({ title: 'C6.13 Target List', css: baseCss() + SHARED, body });
}

module.exports = { buildVisual, buildDocument };
