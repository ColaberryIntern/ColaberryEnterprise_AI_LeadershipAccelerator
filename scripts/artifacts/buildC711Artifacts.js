/**
 * Build C7.11's two deliverables: the one-page decision and the full go/no-go analysis.
 *
 *   node scripts/artifacts/buildC711Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertNoUnverifiedTermIsPresentedAsFact. Every dollar
 * figure in this document is arithmetic on somebody else's procurement terms, read from a
 * ticket rather than from the solicitation. If a later edit marked those terms verified
 * without verifying them, the document would read as a researched bid case and would in
 * fact be a restatement of its own input. The build refuses that.
 *
 * assertTheZeroCompletionFindingSurvives is the second. The contract reimburses per
 * completed slot and this platform has never recorded one; a document that lost that
 * sentence would recommend bidding for revenue we cannot currently invoice.
 *
 * assertPlatformSilenceIsNotReportedAsFailure is the third, and it guards against the
 * mistake C8.12 was written about: the enrollment table starts in March 2026 because the
 * platform does, not because the company does, and reading that as a failed two-year
 * eligibility test would kill a bid on an artifact of a migration date.
 */
const path = require('path');
const D = require('./tickets/c711Data');
const R = require('./tickets/c711Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C7.11');

async function main() {
  const gates = D.assertAllGuards();
  const confirmed = D.assertNoUnverifiedTermIsPresentedAsFact();

  const jobs = [
    { file: 'C711_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C711_2_FAST_AI_GO_NO_GO.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(34) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const blocking = D.GATES.filter((g) => g.blocking).length;
  const unknown = D.GATES.filter((g) => g.closeableBy6Nov.startsWith('UNKNOWN')).length;
  console.log('');
  console.log('  recommendation     : ' + D.VERDICT.recommendation);
  console.log('  procurement terms  : ' + D.RFQ.terms.length + ', ' + confirmed
    + ' independently confirmed');
  console.log('  gates              : ' + gates + ' (' + blocking + ' blocking, '
    + unknown + ' unknown)');
  console.log('  published hours    : ' + D.OURS.catalog.totalEstimatedHours
    + ' across ' + D.OURS.catalog.publishedBlueprints + ' blueprints');
  console.log('  yield gap          : $' + D.ECONOMICS.yields[0].perInstructionalHour
    + '/h vs $' + D.ECONOMICS.yields[1].perInstructionalHour + '/h  ('
    + D.ECONOMICS.yieldRatio + 'x)');
  console.log('  slots to the cap   : ' + D.ECONOMICS.slotsToReachCap);
  console.log('  attendance at 100% : ' + D.OURS.attendance.exactlyOneHundred + ' of ' + D.OURS.attendance.validNonzeroScores + '  (best ' + D.OURS.attendance.best + '%)');
  console.log('  MA leads / called  : ' + D.OURS.massachusetts.maAreaCodeLeads + ' / '
    + D.OURS.massachusetts.maEverContacted);
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
