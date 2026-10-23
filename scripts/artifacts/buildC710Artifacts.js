/**
 * Build C7.10's two deliverables: the one-page expansion map and the full framework.
 *
 *   node scripts/artifacts/buildC710Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertUnpricedPathsAreFlagged. Three of the five paths
 * price cleanly from C2.3; consulting and partner deployment sit outside both of its
 * families and have no approved rate. The temptation on those two is a plausible number,
 * and a plausible number in an expansion framework is how a deal gets priced in the room,
 * which is the exact failure C7.2's proposal template was built to prevent. The build
 * refuses a path that is unpriced and does not say so.
 *
 * THE SECOND ONE IS ABOUT TONE. Colaberry has never run a pilot, so every trigger and
 * timing here is designed rather than observed. A framework that read as though it came
 * from experience would be a lie told by register rather than by claim, so
 * assertNoPilotExperienceIsClaimed keeps the document saying which it is.
 */
const path = require('path');
const D = require('./tickets/c710Data');
const R = require('./tickets/c710Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C7.10');

async function main() {
  const paths = D.assertEveryPathHasTriggerAndTiming();
  const negatives = D.assertNegativeSignalsAreDefined();
  const pricing = D.assertUnpricedPathsAreFlagged();
  const experience = D.assertNoPilotExperienceIsClaimed();

  const jobs = [
    { file: 'C710_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C710_2_EXPANSION_FRAMEWORK.pdf', html: R.buildDocument(), landscape: false,
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
  console.log('  expansion paths         : ' + paths + ', each with a trigger, a signal '
    + 'day and an offer day');
  console.log('  priced from C2.3        : ' + pricing.priced);
  console.log('  explicitly unpriced     : ' + pricing.unpriced.join(', ')
    + '  (C2.3 covers cohorts and licenses only)');
  console.log('  negative signals        : ' + negatives + ', each with an action');
  console.log('  pilots actually run     : ' + experience.pilotsRun
    + '  -- the framework says so on both artifacts');
  console.log('  decision point          : day ' + D.PILOT.decisionDay);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
