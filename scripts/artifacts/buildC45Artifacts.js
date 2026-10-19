/**
 * Build C4.4's script and storyboard and C4.5's runbook, one PDF each.
 *
 *   node scripts/artifacts/buildC45Artifacts.js
 */
const path = require('path');
const D = require('./tickets/c45Data');
const R = require('./tickets/c45Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.4-C4.5');

async function main() {
  const timing = D.assertThreeMinutes();
  const labels = D.assertEveryFrameLabeled();
  D.assertFailurePathScripted();
  D.assertPilotNotCommitted();

  const jobs = [
    { file: 'C44_DEMO_SCRIPT_STORYBOARD.pdf', html: R.buildScript(), maxPages: 0,
      margin: '15mm', what: 'C4.4, the script and storyboard' },
    { file: 'C45_DEMO_RUNBOOK.pdf', html: R.buildRunbook(), maxPages: 0,
      margin: '15mm', what: 'C4.5, the runbook' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(34) + r.pages + ' page(s)  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  const mm = Math.floor(timing.seconds / 60) + ':'
    + String(timing.seconds % 60).padStart(2, '0');
  console.log('');
  console.log('  running time   : ' + mm + ' MEASURED from ' + timing.words
    + ' spoken words at ' + D.WPM + ' wpm (band 2:30-3:15)');
  console.log('  frames         : ' + labels.real + ' real, ' + labels.sample
    + ' sample, all labeled');
  console.log('  failure path   : scripted word for word');
  console.log('  pilot          : NOT committed, asserted');
  console.log('');
  console.log('written to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
