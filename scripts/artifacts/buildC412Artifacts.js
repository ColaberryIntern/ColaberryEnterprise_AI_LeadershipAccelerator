/**
 * Build C4.12's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC412Artifacts.js
 */
const path = require('path');
const D = require('./tickets/c412Data');
const R = require('./tickets/c412Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.12');

async function main() {
  const sourced = D.assertSourced();
  D.assertSeventeenComesOff();
  const judgment = D.assertJudgmentIsLabeled();
  const dated = D.assertDatedWhereItMoves();

  const jobs = [
    { file: 'C412_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C412_2_FIGURE_RECUT.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the recut, figure by figure' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  figures recut, every one with its query : ' + sourced);
  console.log('  judgment calls labeled as judgment    : ' + judgment);
  console.log('  moving figures carrying an as-of date   : ' + dated);
  console.log('  the retired figure                      : comes off, and build-complete is 0');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
