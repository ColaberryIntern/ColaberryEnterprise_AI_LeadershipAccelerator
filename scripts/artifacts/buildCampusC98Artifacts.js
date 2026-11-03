/**
 * Build Campus C98's two deliverables: the one-page feed visual and the evidence report.
 *
 *   node scripts/artifacts/buildCampusC98Artifacts.js
 *
 * THE ASSERTIONS THAT MATTER: F1, F3, F4 and F5 are separate statements in run.sh feed over the same rows; their totals
 * must agree, or one figure was copied from a different run and the documents would disagree with each other.
 */
const path = require('path');
const D = require('./tickets/campusC98Data');
const R = require('./tickets/campusC98Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'campus-C98');

async function main() {
  const t = D.assertConsistent();
  const jobs = [
    { file: 'C98_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1, margin: '9mm' },
    { file: 'C98_2_TODAY_FEED_EVIDENCE.pdf', html: R.buildDocument(), landscape: false, maxPages: 4, margin: '15mm' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file), landscape: j.landscape,
      maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(40) + r.pages + ' page(s)' + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '')
      + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }
  console.log('\n  first session: ~' + t.perPerson + ' items per person, ' + D.TOTALS.openedFirstSession
    + ' opened (totals agree across F1-F6)');
  console.log('  figures as of: ' + D.AS_OF);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
