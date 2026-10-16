/**
 * Build C4.6's pack: two PDFs and the CSV of all thirteen.
 *
 *   node scripts/artifacts/buildC46Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c46Data');
const R = require('./tickets/c46Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.6');

async function main() {
  const picked = D.assertAtMostFive();
  const icps = D.assertEveryIcpCovered();

  fs.mkdirSync(OUT, { recursive: true });
  const csv = R.buildCsv();
  fs.writeFileSync(path.join(OUT, 'C46_CASE_STUDY_PACK.csv'), csv);

  const jobs = [
    { file: 'C46_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page selector' },
    { file: 'C46_2_CASE_STUDY_PACK.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the pack in full' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }
  console.log('  C46_CASE_STUDY_PACK.csv       '
    + (csv.trim().split(String.fromCharCode(10)).length - 1) + ' rows');
  console.log('');
  console.log('  selected        : ' + picked + ' of ' + D.COUNT.total + ' (ceiling 5)');
  console.log('  ICP rows        : ' + icps + ', each with its gap stated');
  console.log('  learner-built   : ' + D.COUNT.learner + ', of which '
    + D.COUNT.learnerPrivate + ' private');
  console.log('  org not nameable: ' + D.COUNT.unnamed);
  console.log('  customer stories: 0, and the assertion holds');
  console.log('');
  console.log('written to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
