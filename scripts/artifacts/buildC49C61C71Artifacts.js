/**
 * Build the three tickets due 13 October, one PDF pair each.
 *
 *   node scripts/artifacts/buildC49C61C71Artifacts.js
 *
 * One entry point because they ship as one phase and one PR. Each ticket's assertions are
 * its own acceptance criteria, run before anything renders, so a failing criterion stops
 * the build rather than reaching a reviewer.
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const TICKETS = [
  {
    code: 'C6.1',
    data: require('./tickets/c61Data'),
    render: require('./tickets/c61Render'),
    out: 'C6.1',
    files: ['C61_1_ONE_PAGE.pdf', 'C61_2_ACCOUNT_DATA_MODEL.pdf'],
    check(D) {
      const entities = D.assertEveryEntityHasAVerdict();
      const builds = D.assertBuildVerdictsAreProven();
      D.assertEveryVerdictNamesAHome();
      D.assertTrapStaysStated();
      return `${entities} entities, ${builds} new table proposed and proven`;
    },
  },
  {
    code: 'C7.1',
    data: require('./tickets/c71Data'),
    render: require('./tickets/c71Render'),
    out: 'C7.1',
    files: ['C71_1_ONE_PAGE.pdf', 'C71_2_LIGHTHOUSE_STANDARD.pdf'],
    check(D) {
      const w = D.assertWeightsAndThresholds();
      const gates = D.assertGatesAreNamed();
      const d = D.assertUsableToDecline();
      D.assertNotDegenerate();
      return `weights ${w.sum}, scale ${w.worst} to ${w.best}, ${gates} gates, `
        + `${d.accepted} accepted and ${d.declined} declined in the worked examples`;
    },
  },
  {
    code: 'C4.9',
    data: require('./tickets/c49Data'),
    render: require('./tickets/c49Render'),
    out: 'C4.9',
    files: ['C49_1_ONE_PAGE.pdf', 'C49_2_BOARD_PACK_TEMPLATE.pdf'],
    check(D) {
      const n = D.assertFixedSectionSet();
      const o = D.assertOutcomesLead();
      const auto = D.assertAutoMarked();
      const mins = D.assertHourBudgetHolds();
      return `${n} sections, ${o.outcomes} outcomes lead and activity is section `
        + `${o.firstActivity}, ${auto} auto, ${mins} minutes budgeted`;
    },
  },
];

async function main() {
  for (const t of TICKETS) {
    const summary = t.check(t.data);
    const dir = path.join(__dirname, '..', '..', 'docs', 'artifacts', t.out);
    console.log('\n' + t.code + '   ' + summary);
    const jobs = [
      { file: t.files[0], html: t.render.buildVisual(), landscape: true, maxPages: 1,
        margin: '10mm' },
      { file: t.files[1], html: t.render.buildDocument(), landscape: false, maxPages: 0,
        margin: '15mm' },
    ];
    for (const j of jobs) {
      const r = await renderPdf({ html: j.html, outPath: path.join(dir, j.file),
        landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
      console.log('   ' + j.file.padEnd(32) + r.pages + ' page(s)'
        + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
        + (r.bytes / 1024).toFixed(0) + ' KB');
    }
  }
  console.log('\nall three built');
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
