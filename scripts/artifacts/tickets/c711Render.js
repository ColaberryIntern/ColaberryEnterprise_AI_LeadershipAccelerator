/**
 * C7.11 - renders the one-page decision and the full go/no-go analysis.
 *
 * Both read c711Data, whose guards refuse an unverified procurement term presented as
 * fact, a confirmation without its quote, a softened attendance finding, a projection
 * presented as a measurement, a seven-month-old database used to judge the company's
 * operating history, a cold list described as a market presence, and a recommendation
 * with no case against it.
 *
 * Three charts, each chosen rather than decorative:
 *
 *   attendanceStrip  draws all 36 measured attendance scores against the line the
 *                    Commonwealth reimburses at. Nobody touches the line. A table of
 *                    percentages lets a reader nod past that; a gap does not.
 *   yieldBars        carries the pricing finding, that a 50-hour course and an 8-hour one
 *                    both earn about the same money.
 *   lengthRisk       the compounding attendance risk by session count. Labeled a model
 *                    on its face, because that is what it is.
 */
const D = require('./c711Data');
const { esc, baseCss, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const SHARED = `
  .go{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:9px;
      font-weight:700;padding:2px 8px;border-radius:3px}
  .gate{display:inline-block;background:#fff7ed;color:#9a3412;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .stop{display:inline-block;background:#fdecea;color:#b3261e;font-size:9px;
        font-weight:700;padding:2px 8px;border-radius:3px}
  .ok2{display:inline-block;background:#e8f5e9;color:#1b5e20;font-size:8.5px;
       font-weight:700;padding:2px 7px;border-radius:3px}
  .warn2{display:inline-block;background:#fff7ed;color:#9a3412;font-size:8.5px;
         font-weight:700;padding:2px 7px;border-radius:3px}
  table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
  th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  code{font-size:9px;background:#f1f5f9;padding:1px 4px;border-radius:3px}
  .bad{background:#fef2f2;border-left:3px solid #b91c1c;padding:10px 12px;font-size:11.5px}
  .key{background:#fff7ed;border-left:3px solid #ea580c;padding:9px 11px;font-size:11px;
       margin:8px 0}
  .ok{background:#f0fdf4;border-left:3px solid #2f7d32;padding:9px 11px;font-size:11px;
      margin:8px 0}
  .quote{font-size:9.5px;color:#475569;font-style:italic}
  p{margin:0 0 8px} ul{margin:5px 0 8px 17px;padding:0} li{margin:3px 0}
`;

/**
 * Every measured attendance score, tallest first, against the 100% line that decides
 * whether a slot is paid. The whole finding is the white space above the bars.
 */
function attendanceStrip(w = 430, h = 150) {
  const a = D.OURS.attendance;
  const bars = [];
  for (const d of a.distribution) for (let i = 0; i < d.n; i += 1) bars.push(d.score);
  const padL = 30;
  const padB = 24;
  const plotH = h - padB - 14;
  const bw = (w - padL - 6) / bars.length;
  const y = (pct) => 14 + plotH * (1 - pct / 100);
  const body = bars.map((s, i) => {
    const x = padL + i * bw;
    const top = y(s);
    return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 1.3).toFixed(1)}"
      height="${(y(0) - top).toFixed(1)}" fill="${TOKENS.CHERRY}" opacity="0.72"/>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
    font-family="'Segoe UI',system-ui,sans-serif" role="img"
    aria-label="All 36 measured attendance scores; none reaches the 100 percent
      reimbursement threshold">
    <line x1="${padL}" y1="${y(100)}" x2="${w - 4}" y2="${y(100)}"
      stroke="${TOKENS.SEV.bad}" stroke-width="1.6" stroke-dasharray="5 3"/>
    <text x="${w - 6}" y="${y(100) - 4}" font-size="9" font-weight="700"
      text-anchor="end"
      fill="${TOKENS.SEV.bad}">100% &#8212; the line Massachusetts pays at. Nobody reaches it.</text>
    <line x1="${padL}" y1="${y(0)}" x2="${w - 4}" y2="${y(0)}"
      stroke="${TOKENS.BORDER}" stroke-width="1"/>
    ${body}
    <text x="0" y="${y(100) + 3}" font-size="8.5" fill="${TOKENS.MUTED}">100</text>
    <text x="0" y="${y(50) + 3}" font-size="8.5" fill="${TOKENS.MUTED}">50</text>
    <text x="0" y="${y(0) + 3}" font-size="8.5" fill="${TOKENS.MUTED}">0</text>
    <text x="${padL}" y="${h - 10}" font-size="9" fill="${TOKENS.INK}">
      <tspan font-weight="700">${a.validNonzeroScores} learners</tspan>, best
      ${a.bestAsSessions} sessions (${a.best}%), mean ${a.mean}%</text>
    <text x="${padL}" y="${h - 1}" font-size="8.5" fill="${TOKENS.MUTED}"
      >Every attendance score this platform holds. One bar per learner.</text>
  </svg>`;
}

/** What an instructional hour is actually paid, by program. */
function yieldBars(w = 430) {
  const rows = D.ECONOMICS.yields;
  const max = Math.max(...rows.map((r) => r.perInstructionalHour));
  const barH = 26;
  const gap = 22;
  const trackW = w - 76;
  const body = rows.map((r, i) => {
    const y = i * (barH + gap) + 14;
    const bw = Math.max(3, Math.round(trackW * (r.perInstructionalHour / max)));
    const fill = i === 0 ? TOKENS.SEV.ok : TOKENS.SEV.bad;
    return `
      <text x="0" y="${y - 4}" font-size="9.5" font-weight="600" fill="${TOKENS.INK}"
        >${esc(r.program)} &#183; ${r.hours}h live &#183; $${r.actuallyPaid}/slot</text>
      <rect x="0" y="${y}" width="${bw}" height="${barH}" fill="${fill}" rx="4"/>
      <text x="${bw + 8}" y="${y + barH / 2 + 4}" font-size="13" font-weight="700"
            fill="${fill}">$${r.perInstructionalHour}</text>`;
  }).join('');
  const h = rows.length * (barH + gap) + 16;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
    font-family="'Segoe UI',system-ui,sans-serif" role="img"
    aria-label="Dollars paid per instructor-led hour delivered, by program">
    ${body}
    <text x="0" y="${h - 2}" font-size="9" fill="${TOKENS.MUTED}"
      >Paid per instructor-led hour. Async lab time earns nothing.</text>
  </svg>`;
}

/** The share of slots that reimburse, by course length. A model, and it says so. */
function lengthRisk() {
  const m = D.ECONOMICS.attendanceModel;
  const rows = m.rows.map((r) => `<tr>
    <td><strong>${r.sessions}</strong> sessions</td>
    <td style="text-align:right">${r.atOurMeasuredRate < 0.1 ? '&lt;0.1' : r.atOurMeasuredRate}%</td>
    <td style="text-align:right"><strong>${r.atNinetyPercent}%</strong></td></tr>`).join('');
  return `<table style="margin:2px 0">
    <tr><th>Course length</th>
        <th style="text-align:right">At our 52.8%</th>
        <th style="text-align:right">At 90%</th></tr>${rows}</table>`;
}

// ---------------------------------------------------------------------------

function buildVisual() {
  const css = baseCss() + SHARED + `
    @page{size:letter landscape;margin:10mm}
    body{font-size:10pt}
    h1{font-size:17pt}
    .rule{margin:6px 0 9px}
    .takeaway{padding:9px 12px;margin-bottom:10px}
    .cols{display:flex;gap:15px;margin-top:3px}
    .col{flex:1;min-width:0}
    .panel{border:1px solid var(--border);border-radius:5px;padding:7px 10px;margin-bottom:5px}
    .panel h3{margin:0 0 4px;font-size:10pt;color:var(--cherry-deep)}
    .gates td{padding:1px 6px;font-size:9.5px}
  `;

  const GATE_NOTES = {
    1: 'named outright as ineligible; a one-line answer either ends or clears this ticket',
    2: 'principals, subcontractor and affiliate experience all explicitly fail to count',
    3: 'must be our own past or current employer clients; the platform cannot name one',
    4: 'Department of Revenue, not Secretary of the Commonwealth; no foreign registration',
    5: 'one resume per instructor per course, plus a W-9 signed within the year',
  };
  const gates = D.GATES.filter((g) => g.blocking).map((g) => {
    const cls = g.closeableBy6Nov.startsWith('BINARY') ? 'stop'
      : g.closeableBy6Nov.startsWith('YES,') ? 'gate' : 'go';
    return `<tr><td style="width:16px"><strong>${g.n}</strong></td>
      <td><strong>${esc(g.name)}</strong>
        <span style="color:var(--muted)"> &#8212; ${esc(GATE_NOTES[g.n] || '')}</span></td>
      <td style="width:56px">${esc(g.owner)}</td>
      <td style="width:148px"><span class="${cls}">${esc(g.closeableBy6Nov)}</span></td></tr>`;
  }).join('');

  const m = D.OURS.massachusetts;

  const body = `
  <h1>Massachusetts Focused AI Skills Training &#8212; go or no-go</h1>
  <div class="meta">C7.11 &#183; Commonwealth Corporation &#183; closes
    ${esc(D.RFQ.deadline)}, ${D.DAYS_LEFT} days out &#183; 12 of 12 terms confirmed
    &#183; production measured ${esc(D.MEASURED_ON)}</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Recommendation</div>
    <div style="font-size:11.5pt;font-weight:600;margin-bottom:4px"
      >${esc(D.VERDICT.recommendation)}</div>
    <div style="font-size:10pt">${esc(D.VERDICT.theReframe)}</div>
  </div>

  <div class="cols">
    <div class="col">
      <div class="panel">
        <h3>The trap: we have never once hit the bar they pay at</h3>
        ${attendanceStrip(420, 132)}
      </div>
      <div class="panel">
        <h3>And course length is what decides it</h3>
        <p style="font-size:9.5px;margin:0 0 2px;color:var(--muted)">Share of slots that
          reimburse, if every session must be attended. A model, not a measurement.</p>
        ${lengthRisk()}
      </div>
    </div>

    <div class="col">
      <div class="panel">
        <h3>The short course also earns 5.1 times more per hour</h3>
        ${yieldBars(420)}
      </div>
      <div class="panel">
        <h3>What changed from the ticket's framing</h3>
        <p style="font-size:9.5px;margin:0"><strong>The blocker is not real.</strong> The
          certificate is a Department of Revenue request, free and online in 24 to 48
          hours. No foreign-corporation registration. The deadline is reachable.</p>
        <p style="font-size:9.5px;margin:4px 0 0"><strong>But the bar is higher.</strong>
          Only instructor-led time is paid, and every hour must be attended.</p>
      </div>
      <div class="panel">
        <h3>Massachusetts: a list, not a relationship</h3>
        <table style="margin:0">
          <tr><td>Leads with a Massachusetts area code</td>
              <td style="text-align:right"><strong>${m.maAreaCodeLeads}</strong></td></tr>
          <tr><td>Distinct employers &#8212; biotech, pharma, insurance</td>
              <td style="text-align:right"><strong>${m.maDistinctEmployers}</strong></td></tr>
          <tr><td>Ever contacted</td>
              <td style="text-align:right"><span class="stop">${m.maEverContacted}</span></td></tr>
        </table>
      </div>
    </div>
  </div>

  <h3 style="margin:4px 0 2px">What has to be true, in the order to check it</h3>
  <table class="gates" style="margin:0">${gates}</table>
  <p style="font-size:9px;margin:5px 0 0"><strong>Gates 1 and 2 are binary and only you can
    answer them.</strong> ${esc(D.VERDICT.theOnlyHardStops)}</p>`;

  return htmlDoc({ title: 'C7.11 - Massachusetts FAST AI go/no-go', css, body });
}

// ---------------------------------------------------------------------------

function buildDocument() {
  const css = baseCss() + SHARED + `@page{size:letter;margin:15mm}`;

  const chip = (v) => (v === 'CONFIRMED' ? 'ok2' : 'warn2');
  const terms = D.RFQ.terms.map((t) => `<tr>
    <td style="width:30px"><code>${t.id}</code></td>
    <td><strong>${esc(t.claim)}</strong><br>
        <span class="quote">${esc(t.quote)}</span></td>
    <td style="width:96px"><span class="${chip(t.verified)}">${esc(t.verified)}</span></td>
    </tr>`).join('');

  const programs = D.OURS.programs.map((p) => `<tr>
    <td><strong>${esc(p.name)}</strong><br>
        <span style="font-size:9.5px;color:${TOKENS.MUTED}">${esc(p.detail)}</span></td>
    <td style="width:62px;text-align:right">${p.instructorLedHours}h<br>
        <span style="font-size:9px;color:${TOKENS.MUTED}">${p.sessions} sess</span></td>
    <td style="width:222px">${esc(p.fit)}</td></tr>`).join('');

  const gates = D.GATES.map((g) => `<tr>
    <td style="width:18px">${g.n}</td>
    <td><strong>${esc(g.name)}</strong><br>
        <span style="font-size:9.5px;color:${TOKENS.MUTED}">${esc(g.detail)}</span></td>
    <td style="width:62px">${esc(g.owner)}</td>
    <td style="width:120px">${esc(g.closeableBy6Nov)}</td></tr>`).join('');

  const decisions = D.DECISIONS.map((d) => `<tr>
    <td style="width:18px">${d.n}</td>
    <td><strong>${esc(d.q)}</strong><br>
        <span style="font-size:10px">${esc(d.rec)}</span></td></tr>`).join('');

  const against = D.CASE_AGAINST.map((x) => `<li>${esc(x)}</li>`).join('');
  const forr = D.CASE_FOR.map((x) => `<li>${esc(x)}</li>`).join('');
  const hours = D.OURS.instructorLedHours.perCohort.map((c) => `<tr>
    <td>${esc(c.cohort)}</td><td style="text-align:right">${c.sessions}</td>
    <td style="text-align:right"><strong>${c.hours}h</strong></td>
    <td>${esc(c.pattern)}</td></tr>`).join('');

  const a = D.OURS.attendance;
  const c = D.OURS.completion;
  const m = D.OURS.massachusetts;
  const e = D.OURS.employerReferences;
  const h = D.OURS.operatingHistory;
  const t = D.OURS.auditTrail;
  const am = D.ECONOMICS.attendanceModel;

  const body = `
  <h1>Massachusetts Focused AI Skills Training</h1>
  <div class="meta">C7.11 go/no-go &#183; ${esc(D.RFQ.issuer)} &#183;
    closes ${esc(D.RFQ.deadline)} &#183; production measured ${esc(D.MEASURED_ON)},
    read-only</div>
  <div class="rule"></div>

  <div class="takeaway">
    <div class="label">Takeaway</div>
    <p style="font-size:11.5pt;font-weight:600;margin-bottom:6px"
      >${esc(D.VERDICT.recommendation)}</p>
    <p style="margin:0">${esc(D.VERDICT.theReframe)} The ticket framed this as money
    against absence and worried about the paperwork. The paperwork turned out to be free
    and two days long. The real obstacle is one nobody had looked at:
    ${esc(D.VERDICT.theTrap)}</p>
  </div>

  <h2>1. The terms, and how far they are verified</h2>
  <div class="key"><strong>Read this before the numbers.</strong>
    ${esc(D.RFQ.sourceLimitation)}</div>
  <table><tr><th>#</th><th>Term, and the language that settles it</th><th>State</th></tr>
    ${terms}</table>
  <p style="font-size:10px;color:${TOKENS.MUTED}">${esc(D.RFQ.round)}</p>

  <h2>2. The finding that decides this: we have never hit 100% attendance</h2>
  <p>Reimbursement is not a threshold. CommCorp requires that
  <strong>attendance records show the trainee attended all instructional hours</strong>,
  plus whatever assessment the course sets. We can test ourselves against that, because
  <code>attendance_records</code> exists and holds ${a.attendanceRecordRows} rows.</p>
  ${attendanceStrip(500, 165)}
  <div class="bad"><strong>${esc(a.verdict)}.</strong> ${esc(a.theConsequence)}
  The best attender in the cohort made ${esc(a.bestAsSessions)} sessions. One absence over
  six months was enough to lose the slot.</div>
  <p style="margin-top:8px"><strong>What this is not.</strong> ${esc(a.honestCaveat)}</p>

  <h3>Why course length, not course quality, is the variable</h3>
  <p>If every session has to be attended, the chance of being paid for a slot falls
  geometrically with the number of sessions. ${esc(am.note)}</p>
  ${lengthRisk()}
  <div class="key">${esc(am.theConclusion)}</div>
  <p><strong>The one mitigation.</strong> ${esc(am.theMitigation)}</p>

  <h2>3. The pricing, and the correction it forced</h2>
  <p>${esc(D.OURS.instructorLedHours.theCorrection)}</p>
  <table><tr><th>Cohort</th><th style="text-align:right">Sessions</th>
    <th style="text-align:right">Live hours</th><th>Pattern</th></tr>${hours}</table>
  <p>${esc(D.ECONOMICS.capBindsExplanation)}</p>
  ${yieldBars(500)}
  <p><strong>${esc(D.ECONOMICS.slotsToReachCapWorking)}</strong> At a ceiling of 100 slots
  per employer that is at least ${D.ECONOMICS.employersNeededAtSaturation} employers, and
  realistically ${esc(D.ECONOMICS.employersNeededRealistically)} The $400,000 is a ceiling,
  not an award &#8212; CommCorp says so in those words.</p>

  <h2>4. What we would submit</h2>
  <table><tr><th>Program</th><th style="text-align:right">Live</th>
    <th>Fit against the rules</th></tr>${programs}</table>
  <div class="ok"><strong>The course already exists.</strong> Massachusetts excludes
  consulting and bespoke single-employer design and scores content against the Department
  of Labor AI literacy framework. A four-session track that names an occupation, runs live,
  and ends in an assessment is not an approximation of what they are buying. It is the
  thing &#8212; and at eight instructor-led hours it is also the best-priced shape
  available.</div>

  <h2>5. The completion record, and the audit trail behind it</h2>
  <p><strong>${esc(c.verdict)}.</strong> Enrollment status takes exactly two values,
  <code>active</code> (${c.enrollmentStatuses[0].n}) and <code>withdrawn</code>
  (${c.enrollmentStatuses[1].n}). Of ${c.cohortMembershipRows} cohort membership rows,
  ${c.cohortMembershipsWithCompletedAt} carry a <code>completed_at</code>, and
  <code>student_certifications</code> holds ${c.studentCertificationRows} rows. The cohort
  named <em>${esc(c.theCompletedCohort.name)}</em> carries status
  <code>${esc(c.theCompletedCohort.cohortStatus)}</code> over a roster of
  ${c.theCompletedCohort.withdrawn} withdrawn and ${c.theCompletedCohort.active} active.</p>
  <p><strong>What we cannot say, and will not.</strong> ${esc(c.honestCaveat)}</p>
  <p>${esc(t.verdict)} Training begins February 2027, so none of this blocks the
  application &#8212; but it stops being optional the day we win, and
  <strong>C8.13 is already open on completion</strong>.</p>

  <h2>6. Massachusetts: what we actually have there</h2>
  <p><strong>${esc(m.verdict)}</strong></p>
  <table>
    <tr><th>Measure</th><th style="text-align:right">Count</th><th>Note</th></tr>
    <tr><td>Leads with a Massachusetts area code</td>
        <td style="text-align:right"><strong>${m.maAreaCodeLeads}</strong></td>
        <td>Out of ${m.leadsWithAnyPhone} leads carrying any phone number</td></tr>
    <tr><td>Naming an employer</td><td style="text-align:right">${m.maLeadsNamingAnEmployer}</td>
        <td>${m.maDistinctEmployers} distinct employers</td></tr>
    <tr><td>Cold Apollo pull</td><td style="text-align:right">121</td>
        <td>These are the ones carrying employer names</td></tr>
    <tr><td>Warm &#8212; alumni and open house</td><td style="text-align:right">22</td>
        <td>None of them names an employer</td></tr>
    <tr><td>Ever contacted</td>
        <td style="text-align:right"><strong>${m.maEverContacted}</strong></td>
        <td>Not one, in either group</td></tr>
    <tr><td>Enrollments with a Massachusetts area code</td>
        <td style="text-align:right">${m.maEnrollments}</td>
        <td>Learners we already serve there</td></tr>
  </table>
  <p><strong>The useful part.</strong> ${esc(m.theUsefulPart)} Named among them:
  ${esc(m.namedEmployers.slice(0, 10).join(', '))}.</p>
  <p style="font-size:10px;color:${TOKENS.MUTED}">An area code is a weak proxy and mobile
  numbers travel. It is used here because it is the only geographic signal the platform
  holds: there is no state, city, postal code or region column on leads, enrollments or
  organizations, and <code>visitors.country</code> is null on all 4,565 rows.</p>

  <h2>7. The two requirements this platform cannot satisfy</h2>
  <h3>Three employer references &#8212; ${esc(e.verdict)}</h3>
  <p>They must be ${esc(e.mustBe)}. ${esc(e.why)} The <code>organizations</code> table
  holds ${e.organizationRows} rows, of which ${e.organizationsThatAreColaberryItself} are
  Colaberry itself and ${e.organizationsThatAreDemoOrFixture} is a demo; the plausible
  external employers are ${esc(e.plausibleExternalEmployers.join(' and '))}. The single
  sponsor row is a fixture.</p>
  <div class="key"><strong>Where they have to come from:</strong>
    ${esc(e.whereTheyMustComeFrom)}</div>

  <h3>Two years as a training provider &#8212; ${esc(h.verdict)}</h3>
  <p>${esc(h.why)}</p>

  <h2>8. The gates, in the order the calendar forces</h2>
  <table><tr><th>#</th><th>Gate</th><th>Owner</th><th>By 6 Nov</th></tr>${gates}</table>
  <div class="bad" style="margin-top:8px"><strong>Gates 1 and 2 come first because they are
  binary.</strong> ${esc(D.VERDICT.theOnlyHardStops)} Everything else in this document is
  wasted effort if either one fails.</div>

  <h2>9. The case against, stated as strongly as the case for</h2>
  <h3>Against</h3><ul>${against}</ul>
  <h3>For</h3><ul>${forr}</ul>
  <div class="key">${esc(D.VERDICT.whyShort)}</div>

  <h2>10. What is needed from you</h2>
  <table>${decisions}</table>
  <p style="margin-top:10px;font-size:10.5px;color:${TOKENS.MUTED}">
    None of the four is an engineering decision. Two are facts about the company, one is a
    bid call, and one is three phone numbers only you have.</p>`;

  return htmlDoc({ title: 'C7.11 - Massachusetts FAST AI go/no-go', css, body });
}

module.exports = { buildVisual, buildDocument, attendanceStrip, yieldBars, lengthRisk };
