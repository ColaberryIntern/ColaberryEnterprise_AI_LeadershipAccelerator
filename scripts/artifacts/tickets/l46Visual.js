/**
 * L4.6 criteria 4 and 5, the one-pager: is the measurement path evidenced, and does it close?
 *
 * WHAT THIS PAGE IS FOR. The record answers "what was reversed and what died". This page answers
 * the question asked before opening it, which is the only one Ali actually has to decide:
 * are criteria 4 and 5 discharged, and does L4.6 close? Same data modules, different audience.
 *
 * WHY THE CHART IS "HOW MANY TESTS NOTICE", NOT "HOW MANY WERE KILLED". Seven of seven killed is
 * the least informative true sentence about this run — a clean sweep is what a reader already
 * expects, so a chart of it carries no information. The spread does: from six tests down to one,
 * with five of the seven resting on a single assertion. That spread IS the finding, and it is the
 * thing a reader would otherwise have to take on trust from page three.
 *
 * WHY THE PAGE ENDS ON WHAT IT DOES NOT ESTABLISH. The two criteria are evidence criteria, and
 * the evidence is now there — but production has collected zero telemetry rows, so what is proven
 * is the instrument, not the audience. A one-pager that showed only the green would be read as
 * "measurement works", and the honest version of that sentence has a second half.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a second,
 * so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l46Data');
const P = require('./l46PlanData');
const F = require('./l46Findings');
const { TOKENS, esc, baseCss, barChart } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

/**
 * A reversal noticed by one test is not a pass to celebrate, so the bar is colored by how much
 * cover it has rather than by whether it died. Everything on this page died; that is not the
 * variable worth encoding in color.
 */
function coverColor(failed) {
  if (failed === 1) return TOKENS.SEV.watch;
  if (failed <= 3) return TOKENS.CHERRY;
  return TOKENS.SEV.ok;
}

function build() {
  /**
   * NO STACKED "7 killed / 0 survived" BAR. It was drawn first and removed on sight: a single
   * segment at full width, in one color, restating a tile directly above it. A chart of a
   * number that cannot vary is decoration, and it was costing a fifth of the page.
   */
  const cover = barChart({
    rows: D.MUTATIONS.map((m) => ({
      label: m.name,
      value: m.failed,
      display: `${m.failed}`,
      color: coverColor(m.failed),
    })),
    max: Math.max(...D.MUTATIONS.map((m) => m.failed)),
    width: 500,
    barH: 18,
    gap: 7,
    labelW: 300,
  });

  const tiles = [
    { n: `${D.TOTALS.killed} of ${D.TOTALS.mutations}`, l: 'reversals killed, 0 survived' },
    { n: `${D.TOTALS.singleTest} of ${D.TOTALS.mutations}`,
      l: 'rest on exactly ONE assertion', warn: true },
    { n: D.TOTALS.distinctTests, l: 'named tests, all found in the sources' },
    { n: `${D.BASELINE.suites} / ${D.BASELINE.tests}`,
      l: `suites / tests green, ${D.BASELINE.pending} skipped` },
    { n: '0', l: 'telemetry rows in production', bad: true },
  ].map((t) => `<div class="tile${t.bad ? ' bad' : ''}${t.warn ? ' warn' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div>
    </div>`).join('\n');

  const plans = P.STAGES.map((s) => `<tr>
      <td class="sz">${esc(s.sessions.toLocaleString('en-US'))}</td>
      <td class="sz">${esc(s.people.toLocaleString('en-US'))}</td>
      <td class="${s.usesIndex ? 'yes' : 'no'}">${s.usesIndex
    ? `${esc(P.META.index)} chosen` : 'Seq Scan — and correct'}</td>
    </tr>`).join('\n');

  const findings = F.FINDINGS.map((f) => `<li>${esc(f.heading)}</li>`).join('\n');

  // Both runs happened on the same day, and printing "measured X and X" reads as a bug rather
  // than as two measurements. Collapse when they agree; say both when they do not.
  const when = D.META.ranOn === P.META.measuredOn
    ? `measured ${esc(D.META.ranOn)}`
    : `measured ${esc(D.META.ranOn)} and ${esc(P.META.measuredOn)}`;

  const body = `
<h1>L4.6 criteria 4 and 5 — the measurement path, reversed and planned</h1>
<p class="sub">Mutation evidence and the query plan · ${when} · generated from
<code>l46Data.js</code>, <code>l46PlanData.js</code> and <code>l46Findings.js</code> · every
test named below checked to exist in the test sources</p>

<div class="tiles">${tiles}</div>

<div class="cols">
  <div>
    <h2>How many of the ${D.BASELINE.tests} tests notice each reversal</h2>
    ${cover}
    <p class="sub">Amber is a reversal that exactly one assertion catches. Every one of the
    ${D.TOTALS.mutations} died, so "all killed" is not the finding — the spread is. Delete or
    rename one <code>it()</code> and a whole property of the audience number goes unguarded
    while the suite still reports green.</p>
    <p class="sub"><strong>The positive control.</strong> <em>${esc(D.CONTROL.name)}</em> PASSES
    under both 503 reversals while the absence assertion dies — so the suite tells a genuine
    zero from a manufactured one, rather than merely reddening when that function is edited.
    Seven kills without a control would prove only that the tests noticed an edit.</p>
    <h2>The ${F.TOTALS.findings} findings behind the record</h2>
    <ul class="fin">${findings}</ul>
  </div>
  <div>
    <h2>Criterion 5 — the plan at three table sizes</h2>
    <table class="plan">
      <tr><th>sessions</th><th>people</th><th>planner's choice</th></tr>
      ${plans}
    </table>
    <p class="sub">Query <strong>extracted from the service at run time</strong>, DDL imported,
    not copied — a hand-copied query is a plan for a statement nobody runs. A plan is a function
    of table statistics, so the row counts belong beside it. The October production run printed
    a plan with no row counts, which is why it could not be interpreted.</p>

    <h2>Why the October production plan is cited, not repeated</h2>
    <p class="sub">It reported the same index, so it is not in conflict — but it printed
    <code>$1</code> and <code>$2</code> <strong>unfolded</strong>, which is a generic plan, and a
    generic plan cannot use the selectivity of the actual values. Every run measured here
    produced a custom plan. That, or the missing row counts, would account for its different
    people-side choice; <strong>this record does not pick between them</strong>, because only a
    re-run that prints the row counts can say which.</p>

    <h2>What this does NOT establish</h2>
    <p class="box"><strong>The instrument is proven; the audience is not.</strong> Both criteria
    are evidence criteria and the evidence is here. But
    <code>broadcast_viewer_sessions</code> has collected <strong>zero rows in production</strong>,
    so nothing on this page says a single real viewer has ever been measured. Seven reversals
    prove the path refuses to lie; they cannot prove it has been asked a question.</p>
    <p class="sub">One command is still owed to whoever next has production access: the EXPLAIN
    re-run, which answers the current plan and the row counts at the same time.</p>
  </div>
</div>
`;

  return htmlDoc({
    title: 'L4.6 — measurement path mutation and plan evidence',
    css: `${baseCss()}
      .tiles { display: flex; gap: 10px; margin: 14px 0 10px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 20px; font-weight: 700; color: ${TOKENS.INK}; line-height: 1.1; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.bad .n { color: ${TOKENS.SEV.bad}; }
      .tile.warn .n { color: ${TOKENS.SEV.watch}; }
      .bar { margin: 6px 0 14px; }
      .cols { display: flex; gap: 22px; }
      .cols > div { flex: 1; }
      h2 { font-size: 12px; margin: 10px 0 6px; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      ul.fin { margin: 0; padding-left: 15px; font-size: 10px; line-height: 1.45; }
      table.plan { border-collapse: collapse; width: 100%; font-size: 10px; }
      table.plan th { text-align: left; font-size: 9px; color: ${TOKENS.MUTED};
        border-bottom: 1px solid ${TOKENS.BORDER}; padding: 3px 6px; font-weight: 600; }
      table.plan td { padding: 4px 6px; border-bottom: 1px solid ${TOKENS.BORDER}; }
      table.plan td.sz { text-align: right; font-variant-numeric: tabular-nums; }
      table.plan td.yes { color: ${TOKENS.SEV.ok}; font-weight: 700; }
      table.plan td.no { color: ${TOKENS.MUTED}; }
      .box { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 9px; margin: 4px 0 6px; }`,
    body,
  });
}

/**
 * The page's own check.
 *
 * Two of these compare the data AGAINST ITSELF rather than against the page, because a check
 * that only compares the two cannot catch a wrong value: change a number in the data and the
 * rendered page changes with it, so they agree and the check still passes.
 */
function selfCheck() {
  const html = build();
  const fail = (msg) => { throw new Error(`l46Visual: ${msg}`); };

  // 1. A clean-sweep page must not be renderable over a recorded survivor. The headline tile
  //    reads "N of N killed, 0 survived" and is generated, so the only way it can lie is for
  //    the data to carry a survivor while the caption stays literal.
  if (D.TOTALS.survived > 0 && /0 survived/.test(html)) {
    fail(`the page says "0 survived" while the data records ${D.TOTALS.survived}. A reversal `
      + 'that lived is the single most important fact about a mutation run and it must not be '
      + 'possible to print a clean sweep over it.');
  }

  // 2. Data against itself: the killed count must account for every reversal, or the page is
  //    reporting on a run whose outcome was never decided.
  if (D.TOTALS.killed + D.TOTALS.survived !== D.TOTALS.mutations) {
    fail(`${D.TOTALS.mutations} reversals but ${D.TOTALS.killed} killed + ${D.TOTALS.survived} `
      + 'survived. Every reversal must be decided one way or the other.');
  }

  // 3. Data against itself: the narrow-cover tile is the page's second headline, so the count
  //    it states has to be the count the mutation rows actually support.
  const narrow = D.MUTATIONS.filter((m) => m.failed === 1).length;
  if (narrow !== D.TOTALS.singleTest) {
    fail(`the tile claims ${D.TOTALS.singleTest} reversals rest on one assertion, but `
      + `${narrow} of the rows report failed === 1.`);
  }

  // 4. The caveat is the reason this page is honest rather than merely green. A visual that
  //    loses it reads as "measurement works", which is the half-truth the record exists to
  //    prevent — so its absence fails the build rather than degrading the page quietly.
  if (!/zero rows in production/.test(html)) {
    fail('the "zero rows in production" caveat is gone. Without it the page reads as proof that '
      + 'the audience has been measured, when it only proves the instrument refuses to lie.');
  }
  if (!/instrument is proven; the audience is not/.test(html)) {
    fail('the instrument-versus-audience line is gone. It is the sentence that stops criteria 4 '
      + 'and 5 being read as "L4.6 is finished".');
  }

  // 5. Every plan stage must appear with a verdict, so a size cannot be dropped from the page
  //    to make the index look chosen everywhere.
  const verdicts = (html.match(/chosen|Seq Scan/g) || []).length;
  if (verdicts < P.STAGES.length) {
    fail(`${P.STAGES.length} plan stages measured but only ${verdicts} verdicts on the page. `
      + 'Dropping the empty-table row would make the index look unconditionally chosen.');
  }

  // 6. The baseline must be the one with the Postgres tier running. A baseline reporting
  //    skipped tests is the five that touch a real lock, and quoting it is the documented trap.
  if (D.BASELINE.pending !== 0) {
    fail(`the baseline reports ${D.BASELINE.pending} skipped. The skipped tests in this scope `
      + 'are the only behavioral evidence about the lock, so a baseline with any is not one '
      + 'this page may quote.');
  }

  return {
    mutations: D.TOTALS.mutations,
    killed: D.TOTALS.killed,
    narrow,
    stages: P.STAGES.length,
    findings: F.TOTALS.findings,
  };
}

module.exports = { build, selfCheck };
