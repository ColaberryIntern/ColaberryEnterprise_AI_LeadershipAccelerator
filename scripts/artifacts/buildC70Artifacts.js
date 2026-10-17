/**
 * Build C7.0's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC70Artifacts.js
 */
const path = require('path');
const D = require('./tickets/c70Data');
const R = require('./tickets/c70Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C7.0');

async function main() {
  const sourced = D.assertSourced();
  const math = D.assertContractArithmetic();
  D.assertChapter132StaysWithdrawn();
  const unverified = D.assertUnverifiedStaysUnverified();

  const jobs = [
    { file: 'C70_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C70_2_ETPL_AND_HB3512.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the go/no-go document' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  figures, every one sourced      : ' + sourced);
  console.log('  contract arithmetic             : ' + math.withContract + ' + '
    + math.without + ' = ' + math.vendor + ' vendor programs, of ' + math.total + ' total');
  console.log('  chapter 132                     : stays withdrawn, assertion holds');
  console.log('  things we could not establish   : ' + unverified + ', listed rather than hidden');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
