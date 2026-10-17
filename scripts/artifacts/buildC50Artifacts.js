/**
 * Build C5.0's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC50Artifacts.js
 *
 * The one-page visual first, then the document, per the standing rule that every ticket
 * ships both and that each item is its own PDF rather than one combined file.
 */
const path = require('path');
const D = require('./tickets/c50Data');
const R = require('./tickets/c50Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.0');

async function main() {
  const sourced = D.assertSourced();
  const probe = D.assertProbeArithmetic();
  D.assertDoesNotClaimVerifiableYet();
  const withheld = D.assertNoLearnerFailuresPublished();

  const jobs = [
    { file: 'C50_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C50_2_CHECKABLE_VERIFICATION.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the document' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  figures, every one sourced : ' + sourced);
  console.log('  probe arithmetic           : ' + probe.ok + ' + ' + probe.dead
    + ' = ' + probe.distinct + ', and 0 dead links publish');
  console.log('  learner fields withheld    : ' + withheld);
  console.log('  claim registry             : the blocked word is not used, assertion holds');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
