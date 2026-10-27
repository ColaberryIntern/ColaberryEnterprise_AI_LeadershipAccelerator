/**
 * Build C8.12's two deliverables: the one-page finding and the full evidence audit.
 *
 *   node scripts/artifacts/buildC812Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertTheZeroBaselineTrapSurvives. The ticket predicted
 * "a schema that exists but holds no rows"; what production holds is a schema full of
 * ZEROS, which is worse, because exit minus baseline completes and reads as measurement.
 * If an edit ever softened that into "the baseline data is sparse", the next reader would
 * ship the fabricated improvement figure, and the build refuses to produce that document.
 *
 * assertCriterionThreeIsNotClaimed is the second. Nothing in the platform measures a
 * learner at intake, so criterion 3 cannot be met in code, and a document that marked it
 * met would close a ticket that is still open on the only thing that mattered.
 */
const path = require('path');
const D = require('./tickets/c812Data');
const R = require('./tickets/c812Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.12');

async function main() {
  const defects = D.assertAllGuards();

  const jobs = [
    { file: 'C812_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C812_2_DAY90_EVIDENCE_AUDIT.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const met = D.CRITERIA.filter((c) => c.verdict === 'MET').length;
  console.log('');
  console.log('  criteria           : ' + D.CRITERIA.length + ', ' + met + ' met');
  console.log('  claims generated   : ' + D.DELIVERED.totalClaims
    + ' for ' + D.DELIVERED.withEvidence + ' of ' + D.DELIVERED.members + ' learners');
  console.log('  openable claims    : ' + D.DELIVERED.openableBefore + ' -> '
    + D.DELIVERED.openableClaims + '  (the fix)');
  console.log('  baseline           : ' + D.BASELINE.verdict);
  console.log('  sponsor            : ' + D.SPONSOR.verdict
    + ' (' + D.SPONSOR.seatsPurchased + ' purchased, ' + D.SPONSOR.seatsMinted + ' minted)');
  console.log('  defects surfaced   : ' + defects);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
