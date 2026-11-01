/**
 * Build Campus C97's two deliverables: the one-page return-path visual and the evidence report.
 *
 *   node scripts/artifacts/buildCampusC97Artifacts.js
 *
 * THE ASSERTIONS THAT MATTER: R1-R6 are separate statements in run.sh returnpath, and their totals must agree
 * (returners, session buckets, never-in breakdown, messaged people). A mismatch means one figure was copied from a
 * different run, and the documents would disagree with each other.
 */
const path = require('path');
const D = require('./tickets/campusC97Data');
const R = require('./tickets/campusC97Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'campus-C97');

async function main() {
  const t = D.assertConsistent();
  const jobs = [
    { file: 'C97_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1, margin: '9mm' },
    { file: 'C97_2_RETURN_PATH_EVIDENCE.pdf', html: R.buildDocument(), landscape: false, maxPages: 0, margin: '15mm' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file), landscape: j.landscape,
      maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(40) + r.pages + ' page(s)' + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '')
      + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }
  console.log('\n  ad Explorers : ' + t.explorers + ', came back ' + t.cameBack + ' (totals agree across R1-R6)');
  console.log('  figures as of: ' + D.AS_OF);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
