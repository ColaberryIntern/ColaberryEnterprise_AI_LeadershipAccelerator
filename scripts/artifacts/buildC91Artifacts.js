/**
 * Build C9.1's two deliverables: the one-page go/no-go and the full readiness report.
 *
 *   node scripts/artifacts/buildC91Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertRecommendationFollowsFromVerdicts. A readiness
 * review that failed criteria and then recommended go would be the most expensive kind
 * of document - one that launders a decision through a process - so the build refuses
 * to produce it. The second is assertEveryVerdictIsBinary, because the ticket names
 * "passing a criterion that is only partly met" as the way this goes wrong.
 */
const path = require('path');
const D = require('./tickets/c91Data');
const R = require('./tickets/c91Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C9.1');

async function main() {
  const total = D.assertEveryVerdictIsBinary();
  const evidenced = D.assertEveryVerdictCitesEvidence();
  const failed = D.assertRecommendationFollowsFromVerdicts();
  const onPath = D.assertEveryFailureIsOnThePath();

  const jobs = [
    { file: 'C91_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C91_2_LAUNCH_READINESS_REVIEW.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(38) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  criteria            : ' + total + ', every verdict binary');
  console.log('  evidenced           : ' + evidenced + ' of ' + total);
  console.log('  PASS                : ' + (total - failed));
  console.log('  FAIL                : ' + failed);
  console.log('  on a critical path  : ' + onPath);
  console.log('  blocked on Ali      : ' + D.CRITICAL_PATH.blockedOnAli.length
    + ' of ' + failed + '  -- the finding worth leading on');
  console.log('');
  console.log('  RECOMMENDATION      : ' + D.RECOMMENDATION.verdict);
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
