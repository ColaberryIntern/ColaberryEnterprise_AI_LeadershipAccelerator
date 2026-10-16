/**
 * Build C4.7: the framework document, a one-page summary, and the worksheet CSV.
 *
 *   node scripts/artifacts/buildC47Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c47Data');
const R = require('./tickets/c47Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.7');

async function main() {
  const inputs = D.assertAllInputsBlank();
  const bench = D.assertEveryBenchmarkSourced();

  fs.mkdirSync(OUT, { recursive: true });
  const csv = R.buildWorksheet();
  fs.writeFileSync(path.join(OUT, 'C47_ROI_WORKSHEET.csv'), csv);

  const jobs = [
    { file: 'C47_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page summary' },
    { file: 'C47_2_ROI_FRAMEWORK.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the framework in full' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(28) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }
  console.log('  C47_ROI_WORKSHEET.csv       '
    + (csv.trim().split(String.fromCharCode(10)).length - 1) + ' rows');
  console.log('');
  console.log('  customer inputs   : ' + inputs + ', all blank and asserted');
  console.log('  benchmarks stated : ' + bench.stated + ', each with a named primary source');
  console.log('  values refused    : ' + bench.refused + ', each with a reason');
  console.log('  guarantee language: none, asserted against the rendered text');
  console.log('');
  console.log('written to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
