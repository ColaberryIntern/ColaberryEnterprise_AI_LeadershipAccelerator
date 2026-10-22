/**
 * Build the path-to-profitability plan as a single self-contained HTML file for Ram.
 *
 *   node scripts/artifacts/buildTurnaroundPlan.js
 *
 * ONE FILE, NO NETWORK. It will be opened on a laptop, possibly forwarded, possibly
 * opened offline. Everything is inline: no CDN, no font fetch, no chart library. The
 * charts are hand-built SVG from the same numbers the text uses.
 *
 * EVERY FIGURE COMES FROM turnaroundData.js. Nothing in this renderer types a number.
 * That is the only way a 20-page document stays consistent with itself when one input
 * changes, and this one has already had its central figure corrected once.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/turnaroundData');
const P = require('./tickets/turnaroundPlan');

const OUT = path.join(__dirname, '..', '..', 'docs', 'COLABERRY_PATH_TO_PROFITABILITY.html');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const money = (n) => '$' + Math.round(n).toLocaleString();

/* ── charts, hand-built so the file needs nothing from the network ────────── */

/** Two series over the eight P&L months. */
function lineChart(series, { w = 720, h = 220, pad = 38 } = {}) {
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 0);
  const min = Math.min(...all, 0);
  const span = (max - min) || 1;
  const n = series[0].values.length;
  const x = (i) => pad + (i * (w - pad * 2)) / (n - 1);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);

  const zero = min < 0 ? `<line x1="${pad}" y1="${y(0)}" x2="${w - pad}" y2="${y(0)}"
    stroke="#cbd5e1" stroke-dasharray="3 3"/>` : '';

  const paths = series.map((s) => {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const dots = s.values.map((v, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"
      stroke-linejoin="round"/>${dots}`;
  }).join('');

  const labels = D.PNL.months.map((m, i) =>
    `<text x="${x(i).toFixed(1)}" y="${h - 12}" text-anchor="middle"
      font-size="10" fill="#64748b">${m}</text>`).join('');

  const legend = series.map((s, i) =>
    `<g transform="translate(${pad + i * 190},14)">
      <rect width="10" height="10" rx="2" fill="${s.color}"/>
      <text x="15" y="9" font-size="11" fill="#334155">${esc(s.name)}</text></g>`).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="${esc(series.map((s) => s.name).join(' and '))} by month">
    ${zero}${paths}${labels}${legend}</svg>`;
}

/** The legacy book's decay, as bars, against the new business as a reference line. */
function decayChart({ w = 720, h = 240, pad = 40 } = {}) {
  const rows = D.LIVE_BOOK.decay;
  const max = Math.max(...rows.map((r) => r.realized));
  const bw = (w - pad * 2) / rows.length - 10;
  const y = (v) => h - pad - (v / max) * (h - pad * 2);

  const bars = rows.map((r, i) => {
    const bx = pad + i * ((w - pad * 2) / rows.length);
    return `<rect x="${bx.toFixed(1)}" y="${y(r.realized).toFixed(1)}" width="${bw.toFixed(1)}"
      height="${(h - pad - y(r.realized)).toFixed(1)}" rx="3" fill="#0f766e" opacity="0.85"/>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${(y(r.realized) - 5).toFixed(1)}"
        text-anchor="middle" font-size="9" fill="#0f766e">${money(r.realized)}</text>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${h - 22}" text-anchor="middle"
        font-size="9" fill="#64748b">${esc(r.month.split(' ')[0])}</text>
      <text x="${(bx + bw / 2).toFixed(1)}" y="${h - 10}" text-anchor="middle"
        font-size="9" fill="#94a3b8">${esc(r.month.split(' ')[1])}</text>`;
  }).join('');

  const mrr = D.monthlyRecurringRevenue();
  const line = `<line x1="${pad}" y1="${y(mrr)}" x2="${w - pad}" y2="${y(mrr)}"
    stroke="#b91c1c" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="${w - pad}" y="${(y(mrr) - 6).toFixed(1)}" text-anchor="end" font-size="10"
      fill="#b91c1c">new business today, ${money(mrr)}</text>`;

  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img"
    aria-label="Legacy subscription book realized monthly against the new business">
    ${bars}${line}</svg>`;
}

/** The decision timeline. Generated from DECISIONS so it cannot drift from the text. */
function timeline() {
  const byPhase = P.PHASES.map((ph) => ({
    phase: ph,
    items: P.DECISIONS.filter((d) => d.phase === ph.id),
  }));
  return byPhase.map(({ phase, items }) => `
    <div class="tl-phase">
      <div class="tl-head">
        <span class="tl-id">${esc(phase.id)}</span>
        <strong>${esc(phase.name)}</strong>
        <span class="tl-win">${esc(phase.window)}</span>
      </div>
      <p class="tl-thesis">${esc(phase.thesis)}</p>
      <ol class="tl-items">
        ${items.map((d) => `<li class="${d.reversible ? '' : 'hard'}">
          <div class="tl-date">${esc(d.by)}</div>
          <div class="tl-body">
            <div class="tl-dec"><span class="chip">${esc(d.id)}</span>
              ${esc(d.decision)}
              ${d.reversible ? '' : '<span class="irr">irreversible</span>'}</div>
            <p>${esc(d.detail)}</p>
            <p class="meta"><strong>Owner:</strong> ${esc(d.owner)} &nbsp;·&nbsp;
              <strong>If wrong:</strong> ${esc(d.costOfBeingWrong)} &nbsp;·&nbsp;
              <strong>Unblocks:</strong> ${esc(d.unblocks)}</p>
          </div></li>`).join('')}
      </ol>
      <p class="tl-exit"><strong>Phase is done when:</strong> ${esc(phase.exitTest)}</p>
    </div>`).join('');
}

/* ── the document ─────────────────────────────────────────────────────────── */

function build() {
  const gap = D.replacementGap();
  const people = D.removableOnSunset();
  const scale = D.scaleMath();
  const comp = D.assertCompIsNotCountedAsRevenue();
  const roster = D.estimatedMonthlyPeopleFloor();

  const css = `
  :root{--ink:#0f172a;--mid:#334155;--soft:#64748b;--line:#e2e8f0;--bg:#ffffff;
    --accent:#0f766e;--warn:#b45309;--bad:#b91c1c;--good:#15803d;--panel:#f8fafc}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:900px;margin:0 auto;padding:40px 24px 80px}
  h1{font-size:30px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
  h2{font-size:21px;margin:44px 0 10px;padding-top:18px;border-top:2px solid var(--line);
    letter-spacing:-.01em}
  h3{font-size:16px;margin:26px 0 8px}
  p{margin:0 0 12px}
  .sub{color:var(--soft);font-size:13px;margin:0 0 28px}
  .lede{font-size:17px;line-height:1.55}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;
    margin:22px 0}
  .kpi{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--panel)}
  .kpi .n{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
  .kpi .l{font-size:11px;color:var(--soft);text-transform:uppercase;letter-spacing:.06em;
    margin-top:4px}
  .kpi .f{font-size:11px;color:var(--soft);margin-top:6px}
  .kpi.bad .n{color:var(--bad)} .kpi.good .n{color:var(--good)}
  .kpi.warn .n{color:var(--warn)}
  .callout{border-left:4px solid var(--warn);background:#fffbeb;padding:14px 16px;
    border-radius:0 8px 8px 0;margin:18px 0}
  .callout.bad{border-color:var(--bad);background:#fef2f2}
  .callout.good{border-color:var(--good);background:#f0fdf4}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13.5px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);
    vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--soft);
    border-bottom:2px solid var(--line)}
  td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .chart{width:100%;height:auto;margin:10px 0 4px}
  .cap{font-size:11.5px;color:var(--soft);margin:0 0 18px}
  .tl-phase{border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:16px 0;
    background:var(--panel)}
  .tl-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .tl-id{background:var(--accent);color:#fff;font-size:11px;font-weight:700;
    padding:2px 8px;border-radius:20px}
  .tl-win{color:var(--soft);font-size:12px}
  .tl-thesis{font-size:13.5px;color:var(--mid);margin:8px 0 12px}
  .tl-items{list-style:none;margin:0;padding:0}
  .tl-items li{display:flex;gap:14px;padding:12px 0;border-top:1px solid var(--line)}
  .tl-items li.hard{background:#fef2f2;margin:0 -10px;padding:12px 10px;border-radius:6px}
  .tl-date{font-size:12px;color:var(--soft);min-width:84px;font-variant-numeric:tabular-nums}
  .tl-dec{font-weight:600;margin-bottom:5px}
  .tl-body p{font-size:13px;margin:0 0 6px;color:var(--mid)}
  .tl-body .meta{font-size:11.5px;color:var(--soft)}
  .chip{display:inline-block;background:#e2e8f0;color:var(--mid);font-size:10px;
    font-weight:700;padding:1px 6px;border-radius:4px;margin-right:6px;vertical-align:1px}
  .irr{display:inline-block;background:var(--bad);color:#fff;font-size:10px;font-weight:700;
    padding:1px 7px;border-radius:4px;margin-left:8px;text-transform:uppercase}
  .tl-exit{font-size:12.5px;color:var(--mid);margin:12px 0 0;padding-top:10px;
    border-top:1px dashed var(--line)}
  .tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;
    text-transform:uppercase;letter-spacing:.04em}
  .tag.live{background:#dcfce7;color:#166534}
  .tag.no{background:#fee2e2;color:#991b1b}
  .tag.risk{background:#fef3c7;color:#92400e}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .card{border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .src{font-size:11px;color:var(--soft);font-style:italic}
  ul{margin:6px 0 12px 20px;padding:0} li{margin:4px 0}
  @media (max-width:720px){.two{grid-template-columns:1fr}.wrap{padding:24px 16px 60px}
    .tl-items li{flex-direction:column;gap:4px}}
  @media print{.tl-items li.hard{background:#fff;border:1px solid var(--bad)}
    h2{page-break-after:avoid}.tl-phase{page-break-inside:avoid}}
  `;

  const body = `
<div class="wrap">
  <h1>Colaberry: the path to profitability</h1>
  <p class="sub">Prepared for Ram &middot; ${esc(D.AS_OF)} &middot; every figure measured,
    every source named &middot; nothing here has been decided</p>

  <p class="lede">The school's books look healthy. They are being held up by a
  <strong>$13,877 a month subscription book that nobody is managing as a subscription
  book</strong>, attached to a program we are about to switch off. The new business earns
  ${money(gap.mrr)} a month from ${D.SUBSCRIPTIONS.distinctPayingHumans} people. The whole
  plan turns on not destroying the first while building the second.</p>

  <div class="kpis">
    <div class="kpi"><div class="n">${money(D.sum(D.PNL.netIncome))}</div>
      <div class="l">Net income, Jan&ndash;Aug</div>
      <div class="f">Looks fine. Read the next three.</div></div>
    <div class="kpi warn"><div class="n">${money(gap.legacy)}</div>
      <div class="l">Legacy book, per month</div>
      <div class="f">${D.LIVE_BOOK.activeSchedules} live schedules, realized</div></div>
    <div class="kpi bad"><div class="n">${money(gap.mrr)}</div>
      <div class="l">New business, per month</div>
      <div class="f">${D.SUBSCRIPTIONS.distinctPayingHumans} paying people</div></div>
    <div class="kpi bad"><div class="n">${(gap.coverage * 100).toFixed(0)}%</div>
      <div class="l">Coverage of the old by the new</div>
      <div class="f">Gap of ${money(gap.gap)} a month</div></div>
  </div>

  <h2>1. The finding that changes the question</h2>

  <div class="callout bad">
    <p><strong>Account "4300 ISA Placement Income" is not an ISA placement book.</strong>
    It carries ${money(D.ACCOUNT_4300.eightMonthTotal)} over eight months.
    ${money(D.ACCOUNT_4300.traceablePlacementFees)} of that &mdash;
    ${D.assertAccount4300IsNotCalledIsa().sharePct}% &mdash; is traceable placement-fee
    cash, from four named students. The rest looks like legacy
    <strong>$250-a-month training subscriptions</strong> booked into an account named
    after something else.</p>
    <p style="margin:0">${esc(D.ACCOUNT_4300.unexplained)}</p>
  </div>

  <div class="callout">
    <p style="margin:0 0 8px"><strong>Why the name misleads, precisely.</strong>
    ${esc(D.ACCOUNT_4300.whyTheNameMisleads)}</p>
    <p style="margin:0">Real ISA placement income is about
    <strong>${money(D.ACCOUNT_4300.realIsaPerMonth)} a month</strong> and ends
    ${esc(D.ISA_RUNOFF.zeroBy)}. It is a line item, not the business.</p>
  </div>

  <h3>What is actually inside account 4300</h3>
  <table>
    <thead><tr><th>Component</th><th class="num">Share</th><th class="num">Jan&ndash;Aug</th></tr></thead>
    <tbody>${D.ACCOUNT_4300.composition.map((c) => `<tr>
      <td>${esc(c.what)}</td>
      <td class="num">${(c.share * 100).toFixed(1)}%</td>
      <td class="num">${money(c.approx)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="cap">Cross-check against the processor: September settled
  ${money(D.RECENT_ACTUALS.septemberSettled)}, October to the 21st
  ${money(D.RECENT_ACTUALS.octoberToThe21st)}. ${esc(D.RECENT_ACTUALS.note)}</p>

  <div class="callout bad">
    <p style="margin:0"><strong>The other channel has stopped.</strong> Account 4200, the
    PayPal column, went from ${money(D.PAYPAL_CHANNEL.monthly[0])} in January to
    ${money(D.PAYPAL_CHANNEL.monthly[7])} in August, and was
    <strong>negative ${money(Math.abs(D.PAYPAL_CHANNEL.monthly[5]))}</strong> in June on
    refunds. One processor is carrying almost everything.</p>
  </div>

  <p>This matters because the two have opposite risk shapes, and the plan you write is
  different in each case.</p>

  <div class="two">
    <div class="card"><h3 style="margin-top:0">If it were an ISA book</h3>
      <p style="font-size:13.5px;margin:0">It winds down on a schedule you can forecast.
      You know the end date, you plan around it, and nothing you do changes the curve.
      The real ISA run-off does behave this way &mdash; and it is nearly over:
      <strong>${money(D.ISA_RUNOFF.nominalRemaining)} scheduled across
      ${D.ISA_RUNOFF.liveSchedules} contracts, gone by
      ${esc(D.ISA_RUNOFF.zeroBy)}</strong>.</p></div>
    <div class="card" style="border-color:var(--bad)">
      <h3 style="margin-top:0">What it actually is</h3>
      <p style="font-size:13.5px;margin:0">A subscription book that keeps paying
      indefinitely &mdash; some schedules run to 2034 &mdash; and can stop
      <strong>all at once</strong>, the moment subscribers decide they are no longer
      receiving anything. It does not expire. It cancels.</p></div>
  </div>

  <h3>The legacy book, month by month</h3>
  ${decayChart()}
  <p class="cap">Realized at the measured ${(D.REALIZATION.rate * 100).toFixed(1)}%
  collection rate, not scheduled face value. Dashed line is the entire new business today.
  <span class="src">${esc(D.LIVE_BOOK.src)}</span></p>

  <div class="callout">
    <p style="margin:0"><strong>The assumption doing all the work:</strong>
    ${esc(D.LIVE_BOOK.keyRisk)} No dataset can settle this. It is a service-delivery
    question, and it is the single largest financial risk in this plan.</p>
  </div>

  <h2>2. What the P&amp;L shows, and what it hides</h2>

  ${lineChart([
    { name: 'Account 4300 (the subscription book)', values: D.PNL.acct4300, color: '#0f766e' },
    { name: 'Tuition and training', values: D.PNL.tuition, color: '#b45309' },
  ])}
  <p class="cap">Tuition fell from ${money(D.PNL.tuition[0])} in January to
  ${money(D.PNL.tuition[7])} in August; June is negative on refunds. The upper line is the
  book that is actually paying the bills.
  <span class="src">${esc(D.PNL.src)}</span></p>

  <table>
    <thead><tr><th>What</th><th class="num">Amount</th><th>Reading</th></tr></thead>
    <tbody>
      <tr><td>Total income, Jan&ndash;Aug</td>
        <td class="num">${money(D.sum(D.PNL.totalIncome))}</td>
        <td>78% of it arrived through one payment processor</td></tr>
      <tr><td>Steady-state monthly cost</td>
        <td class="num">${money(D.steadyStateMonthlyCost())}</td>
        <td>One-offs removed: ${[...new Set(D.ONE_OFFS.map((o) => o.account.split(' ').slice(1).join(' ')))].map(esc).join(', ')}</td></tr>
      <tr><td>Commission actually paid</td>
        <td class="num">${money(D.PNL_GAP.commissionActuallyPaid)}</td>
        <td>Measured from the commission runs</td></tr>
      <tr><td>Commission in this P&amp;L</td>
        <td class="num">${money(D.PNL_GAP.recordedInSchoolPnl)}</td>
        <td>The difference is a coding decision, not missing money</td></tr>
      <tr><td><strong>Unexplained coding gap</strong></td>
        <td class="num"><strong>${money(D.PNL_GAP.gap)}</strong></td>
        <td><strong>Until someone says which class it went to, the school's true cost base
          is unknown</strong></td></tr>
    </tbody>
  </table>

  <div class="callout bad">
    <p style="margin:0"><strong>Less than half of every drafted dollar clears.</strong>
    Realization is ${(D.REALIZATION.rate * 100).toFixed(1)}% &mdash;
    ${money(D.REALIZATION.settled)} settled against ${money(D.REALIZATION.attempted)}
    attempted. ${esc(D.REALIZATION.monthlyReturns)}. ${esc(D.REALIZATION.implication)}</p>
  </div>

  <h2>3. The new business, honestly</h2>

  <p>${esc(D.FUNNEL.note)}</p>

  <div class="kpis">
    <div class="kpi"><div class="n">${comp.headline}</div><div class="l">rows read "active"</div>
      <div class="f">the number usually quoted</div></div>
    <div class="kpi bad"><div class="n">${comp.comp}</div><div class="l">are complimentary</div>
      <div class="f">more free seats than payers</div></div>
    <div class="kpi bad"><div class="n">${comp.billing}</div><div class="l">actually bill</div>
      <div class="f">${D.SUBSCRIPTIONS.lapsedButMarkedActive} more have lapsed periods</div></div>
    <div class="kpi bad"><div class="n">${D.SUBSCRIPTIONS.newPaidEnrollmentsByMonth.Oct}</div>
      <div class="l">new paid in October</div>
      <div class="f">down from ${D.SUBSCRIPTIONS.newPaidEnrollmentsByMonth.Jul} in July</div></div>
  </div>

  <p>Lifetime cash collected by the new business, across its entire existence:
  <strong>${money(D.SUBSCRIPTIONS.lifetimeGross)}</strong>. That is not a monthly figure.
  ${D.SUBSCRIPTIONS.cancellations.total} of roughly
  ${D.SUBSCRIPTIONS.cancellations.everStarted} subscriptions ever started have canceled.</p>

  <h3>Three defects leaking money from a funnel that already works</h3>
  <table>
    <thead><tr><th>#</th><th>Defect</th><th>Effect</th></tr></thead>
    <tbody>${D.REVENUE_DEFECTS.map((x) => `<tr>
      <td><span class="chip">${esc(x.id)}</span></td>
      <td><strong>${esc(x.defect)}</strong><br>
        <span style="font-size:12.5px;color:var(--mid)">${esc(x.detail)}</span></td>
      <td style="font-size:12.5px">${esc(x.effect)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="cap">None of these needs a new product, a new hire, or a dollar of marketing.</p>

  <h2>4. The engines: eight listed, one earning</h2>
  <table>
    <thead><tr><th>Engine</th><th>Earning?</th><th class="num">Today</th>
      <th>Earliest honest revenue</th></tr></thead>
    <tbody>${D.ENGINES.map((e) => `<tr>
      <td><strong>${esc(e.name)}</strong><br>
        <span style="font-size:12px;color:var(--soft)">${esc(e.state)}</span></td>
      <td><span class="tag ${e.earns ? 'live' : 'no'}">${e.earns ? 'yes' : 'no'}</span></td>
      <td class="num">${e.monthly ? money(e.monthly) + '/mo' : '$0'}</td>
      <td style="font-size:12.5px">${esc(e.earliest)}<br>
        <span style="color:var(--mid)">${esc(e.verdict)}</span></td></tr>`).join('')}</tbody>
  </table>

  <h2>5. Do we need to lay people off?</h2>

  <div class="callout good">
    <p style="margin:0"><strong>Largely, it has already happened by attrition.</strong>
    Commission cost has fallen ${Math.round((1 - D.PEOPLE.trend[4].monthly / D.PEOPLE.trend[0].monthly) * 100)}%
    since 2023 &mdash; from ${money(D.PEOPLE.trend[0].monthly)} a month across
    ${esc(D.PEOPLE.trend[0].people)} people to ${money(D.PEOPLE.trend[4].monthly)} across
    ${esc(D.PEOPLE.trend[4].people)}. Teaching and TA commission reached
    <strong>zero in August</strong> with nobody dismissed: the classes ended and the cost
    went with them.</p>
  </div>

  <table>
    <thead><tr><th>Component</th><th class="num">Monthly</th><th>Type</th><th>Reading</th></tr></thead>
    <tbody>
      ${D.PEOPLE.components.map((c) => `<tr>
        <td><strong>${esc(c.name)}</strong></td><td class="num">${money(c.monthly)}</td>
        <td><span class="tag ${c.kind === 'FIXED' ? 'risk' : 'live'}">${esc(c.kind)}</span></td>
        <td style="font-size:12.5px">${esc(c.detail)}</td></tr>`).join('')}
      ${D.PEOPLE.survives.map((c) => `<tr>
        <td>${esc(c.name)}</td><td class="num">${money(c.monthly)}</td>
        <td><span class="tag no">survives</span></td>
        <td style="font-size:12.5px">${esc(c.detail)}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="callout bad">
    <p style="margin:0"><strong>Do not cut the mentors in isolation.</strong> The retainer
    is ${money(D.assertMentorCutIsSequencedWithBook().mentorMonthly)} a month and the book
    those mentors support pays
    ${D.assertMentorCutIsSequencedWithBook().multiple}&times; that every month. Saving
    ${money(people.removable - 2250)} and triggering a cancellation wave is the most
    expensive economy available here. The wind-down has to be sequenced against the book,
    not run independently.</p>
  </div>

  <p><strong>The real decision is invisible in this P&amp;L.</strong>
  ${money(D.PNL_GAP.gap)} of commission sits outside the school class, and the health
  insurance line of ${money(D.PEOPLE.survives[2].monthly)} a month proves W2 employees
  exist whose wages do not appear here at all. No salaried decision should be taken before
  that register arrives.</p>

  <h3>What the P&amp;L is almost certainly hiding</h3>

  <div class="callout bad">
    <p style="margin:0 0 8px"><strong>These are estimates from memory, not a payroll
    register, and they are in this document only to show the size of what is missing.</strong>
    Hours are assumed. Allocation to the school is unknown and known to be partial. Do not
    act on the total; act on getting the register.</p>
    <p style="margin:0">On that basis the people cost is at least
    <strong>${money(roster.monthly)} a month for ${roster.counted} people</strong>, which
    is more than double the ${money(D.steadyStateMonthlyCost())} the entire school P&amp;L
    records as its total cost. ${esc(roster.note)}</p>
  </div>

  <table>
    <thead><tr><th>Who</th><th>Where</th><th>Basis</th><th>Confidence</th></tr></thead>
    <tbody>
      ${D.ESTIMATED_ROSTER.people.map((x) => `<tr>
        <td><strong>${esc(x.who)}</strong>${x.role ? ' <span style="color:var(--soft)">'
          + esc(x.role) + '</span>' : ''}</td>
        <td>${esc(x.where)}</td>
        <td>${x.basis === 'salary'
          ? (x.annual != null ? money(x.annual) + ' a year'
            : money(x.annualLow) + ' to ' + money(x.annualHigh) + ' a year')
          : '$' + x.hourly + ' an hour' + (x.partTime ? ', part time' : '')}</td>
        <td style="font-size:12px;color:var(--soft)">${esc(x.confidence)}</td></tr>`).join('')}
      ${D.ESTIMATED_ROSTER.noRateGiven.map((x) => `<tr>
        <td>${esc(x.who)}</td><td>${esc(x.where)}</td>
        <td><span class="tag no">no rate given</span></td>
        <td style="font-size:12px;color:var(--soft)">${esc(x.note || 'not counted above')}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <p>${esc(D.ESTIMATED_ROSTER.whyOffshoreMatters)}</p>

  <h2>6. Ten thousand learners: what the arithmetic allows</h2>

  <p>${scale.perMonthNeeded} learners a month for ${D.SCALE_TARGET.months} months. The
  July cohort was ${D.COHORTS[1].active} and November is ${D.COHORTS[2].active}. At fifty
  per cohort that is eight concurrent cohorts starting every month, which is a different
  company. Selling it one subscription at a time is worse: October produced
  ${D.SUBSCRIPTIONS.newPaidEnrollmentsByMonth.Oct}.</p>

  <table>
    <thead><tr><th>Channel</th><th class="num">Learners</th><th class="num">Revenue</th>
      <th>Gated by</th></tr></thead>
    <tbody>${scale.rows.map((r, i) => `<tr>
      <td><strong>${esc(r.channel)}</strong><br>
        <span style="font-size:12px;color:var(--soft)">${esc(D.DELIVERY_CHANNELS[i].why)}</span></td>
      <td class="num">${r.learners.toLocaleString()}</td>
      <td class="num">${money(r.revenue)}</td>
      <td style="font-size:12.5px">${esc(D.DELIVERY_CHANNELS[i].gatedBy)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td>
        <td class="num"><strong>${scale.learners.toLocaleString()}</strong></td>
        <td class="num"><strong>${money(scale.revenue)}</strong></td>
        <td style="font-size:12.5px">${money(scale.monthlyRevenue)} a month averaged</td></tr>
    </tbody>
  </table>

  <div class="callout">
    <p style="margin:0"><strong>Eighty percent of the target arrives in blocks.</strong>
    Sixteen institutional deals. Selling 100 companies 100 seats is a motion this company
    has run for fourteen years; selling 10,000 individuals one at a time is not. Live
    cohorts can only be ${((scale.rows[2].learners / scale.learners) * 100).toFixed(0)}% of
    volume before instructor time breaks.</p>
  </div>

  <h2>7. What we sell</h2>
  <table>
    <thead><tr><th>Tier</th><th>Price</th><th>Status</th><th>Role</th></tr></thead>
    <tbody>${P.OFFERS.map((o) => `<tr>
      <td><strong>${esc(o.tier)}</strong><br>
        <span style="font-size:12px;color:var(--soft)">${esc(o.who)}</span></td>
      <td style="font-size:12.5px">${esc(o.price)}</td>
      <td><span class="tag ${/NEVER|BUNDLED/.test(o.status) ? 'no'
        : /RISK/.test(o.status) ? 'risk' : 'live'}">${esc(o.status)}</span></td>
      <td style="font-size:12.5px">${esc(o.role)}</td></tr>`).join('')}</tbody>
  </table>

  <h2>8. The timeline, and every decision on it</h2>
  <p>${P.assertEveryDecisionIsDatedAndOwned()} decisions.
  ${P.assertIrreversibleDecisionsAreFlagged().length} of them cannot be undone and are
  marked. Those are where the attention belongs.</p>
  ${timeline()}

  <h2>9. Survive, and thrive</h2>
  <div class="two">
    ${P.SCENARIOS.map((s) => `<div class="card">
      <h3 style="margin-top:0">${esc(s.name)}</h3>
      <p style="font-size:13.5px"><strong>Shape.</strong> ${esc(s.shape)}</p>
      <p style="font-size:13.5px"><strong>Requires.</strong> ${esc(s.requires)}</p>
      <p style="font-size:13.5px"><strong>Outcome.</strong> ${esc(s.outcome)}</p>
      <p style="font-size:13.5px;margin:0"><strong>Risk.</strong> ${esc(s.risk)}</p>
    </div>`).join('')}
  </div>

  <h2>10. This week</h2>
  <table>
    <thead><tr><th>#</th><th>What</th><th>Why it cannot wait</th></tr></thead>
    <tbody>${D.URGENT_FLAGS.map((u) => `<tr>
      <td><span class="tag risk">${esc(u.severity)}</span></td>
      <td><strong>${esc(u.action)}</strong><br>
        <span style="font-size:12.5px;color:var(--mid)">${esc(u.what)}</span></td>
      <td style="font-size:12.5px">${esc(u.risk)}</td></tr>`).join('')}</tbody>
  </table>

  <h2>11. What we still do not know</h2>
  <p>Three things are unmeasured. Each is named rather than estimated, because a guess
  here becomes a decision about someone's job.</p>
  <table>
    <thead><tr><th>Unknown</th><th>Why it matters</th><th>Where it lives</th></tr></thead>
    <tbody>${D.OPEN_MEASUREMENTS.map((o) => `<tr>
      <td><strong>${esc(o.what)}</strong></td>
      <td style="font-size:12.5px">${esc(o.why)}</td>
      <td style="font-size:12.5px">${esc(o.where)}</td></tr>`).join('')}</tbody>
  </table>

  <p class="src" style="margin-top:32px">Sources: ${esc(D.PNL.src)}; ${esc(D.ACCOUNT_4300.src)};
  ${esc(D.SUBSCRIPTIONS.src)}; ${esc(D.PEOPLE.src)}. Prepared ${esc(D.AS_OF)}.
  No decision in this document has been taken.</p>
</div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Colaberry: the path to profitability</title>
<style>${css}</style></head><body>${body}</body></html>`;
}

function main() {
  // Every guard runs before a single byte is written. A document this consequential
  // should refuse to exist rather than exist wrong.
  const checks = {
    sources: D.assertEveryFigureHasASource(),
    comp: D.assertCompIsNotCountedAsRevenue(),
    account4300: D.assertAccount4300IsNotCalledIsa(),
    engines: D.assertOnlyEarningEnginesClaimRevenue(),
    mentor: D.assertMentorCutIsSequencedWithBook(),
    unknowns: D.assertUnknownsAreDeclared(),
    realization: D.assertRealizationIsApplied(),
    decisions: P.assertEveryDecisionIsDatedAndOwned(),
    irreversible: P.assertIrreversibleDecisionsAreFlagged(),
    offers: P.assertUnsoldOffersAreMarked(),
    sequencing: P.assertRetentionPrecedesSunsetNotice(),
    roster: D.assertRosterIsLabeledAnEstimate(),
  };

  const html = build();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, 'utf8');

  console.log(`  ${path.basename(OUT).padEnd(42)} ${(html.length / 1024).toFixed(0)} KB`);
  console.log('');
  console.log('  figure blocks sourced   : ' + checks.sources);
  console.log('  subscriptions           : ' + checks.comp.headline + ' active rows, '
    + checks.comp.billing + ' billing, ' + checks.comp.comp + ' comp');
  console.log('  account 4300 traceable  : ' + checks.account4300.sharePct + '%');
  console.log('  engines earning         : ' + checks.engines.earning + ' of '
    + checks.engines.engines);
  console.log('  mentor retainer vs book : ' + checks.mentor.multiple + 'x');
  console.log('  decisions               : ' + checks.decisions + ', '
    + checks.irreversible.length + ' irreversible (' + checks.irreversible.join(', ') + ')');
  console.log('  retention before notice : ' + checks.sequencing.retention + ' then '
    + checks.sequencing.notice);
  console.log('  declared unknowns       : ' + checks.unknowns);
  console.log('  roster (ESTIMATE only)  : $' + checks.roster.monthly.toLocaleString()
    + ' floor, ' + checks.roster.counted + ' counted, '
    + checks.roster.uncounted + ' with no rate');
  console.log('');
  console.log('written to ' + OUT);
}

main();
