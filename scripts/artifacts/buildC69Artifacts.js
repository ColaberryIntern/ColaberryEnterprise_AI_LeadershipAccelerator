/**
 * Build C6.9's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC69Artifacts.js
 *
 * The assertion that matters is assertEvidenceStillTrue. This document's whole value is a
 * recommendation, and a recommendation is only as good as the facts under it. Each of the
 * five evidence rows carries a check that runs against the actual repository at build time,
 * so if someone adds a web-search dependency or lifts the deny-list, this stops building
 * and the verdict gets rewritten instead of quietly going stale.
 */
const path = require('path');
const D = require('./tickets/c69Data');
const R = require('./tickets/c69Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.9');

async function main() {
  const evidence = D.assertEvidenceStillTrue();
  D.assertRecommendationIsADecision();
  const triggers = D.assertReversalTriggersAreNumeric();
  const cost = D.assertCostIsDerived();
  const schema = D.assertGateCoversTheSchema();

  const jobs = [
    { file: 'C69_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C69_2_BRIEF_RECOMMENDATION.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(34) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  verdict                  : ' + D.RECOMMENDATION.verdict.split('.')[0]);
  console.log('  evidence rows re-checked : ' + evidence + ', all still true');
  console.log('  model cost, all accounts : $' + cost.all.toFixed(2)
    + '  ($' + cost.per.toFixed(3) + ' a brief)');
  console.log('  research behind them     : ' + cost.hours.toFixed(0) + ' hours');
  console.log('  already hand-sourced     : ' + D.ALREADY_DONE.withASourcedOpening
    + ' of ' + D.ALREADY_DONE.accounts + ' accounts, by C6.7');
  console.log('  brief schema             : ' + schema.sections + ' sections, '
    + schema.sourced + ' require a source URL and a date');
  console.log('  reversal triggers        : ' + triggers + ', all numeric');
  console.log('  anything built           : NO. A decision document and a gate.');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
