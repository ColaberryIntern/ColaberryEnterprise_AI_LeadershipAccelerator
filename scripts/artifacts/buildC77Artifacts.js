/**
 * Build C7.7's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC77Artifacts.js
 *
 * The assertions run before any PDF is written. The one that matters most is
 * assertNoCertificationClaimed: the ticket says the work becomes untrustworthy by claiming
 * a certification we do not hold, and this document is the one most likely to be quoted
 * back at us, so the build refuses to produce it if the prose ever drifts that way.
 */
const path = require('path');
const D = require('./tickets/c77Data');
const R = require('./tickets/c77Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C7.7');

async function main() {
  const certs = D.assertNoCertificationClaimed();
  const gaps = D.assertEveryGapHasEvidence();
  const strengths = D.assertStrengthsPresent();
  const claims = D.assertClaimExposureRecorded();
  const tally = D.assertHeadlineMatchesGaps();

  const jobs = [
    { file: 'C77_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C77_2_SECURITY_GAP_REPORT.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '14mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  gaps, each with evidence   : ' + gaps);
  console.log('  severity tally             : ' + tally);
  console.log('  controls genuinely in place: ' + strengths);
  console.log('  certifications, all stated as not held: ' + certs);
  console.log('  live SOC 2 wording recorded: ' + claims + ' places');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
