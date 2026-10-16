/**
 * Build C3.8's tracker: two PDFs and the CSV that is the living artifact.
 *
 *   node scripts/artifacts/buildC38Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c38Data');
const R = require('./tickets/c38Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.8');

async function main() {
  const counts = D.assertEveryRowActionable();
  D.assertSeededFromBoth();

  fs.mkdirSync(OUT, { recursive: true });
  const csv = R.buildCsv();
  fs.writeFileSync(path.join(OUT, 'C38_PARTNER_TRACKER.csv'), csv);

  const jobs = [
    { file: 'C38_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page board' },
    { file: 'C38_2_PARTNER_TRACKER.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the tracker in full' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(28) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }
  const rows = csv.trim().split(String.fromCharCode(10)).length - 1;
  console.log('  C38_PARTNER_TRACKER.csv     ' + rows + ' rows');
  console.log('');
  console.log('  rows    : ' + counts.rows + ' across ' + counts.tracks + ' tracks');
  console.log('  overdue : ' + D.overdue().length);
  console.log('  risks   : ' + D.RISKS.length + ', worst is ' + D.RISKS[0].sev
    + ' on row ' + D.RISKS[0].row);
  console.log('');
  console.log('written to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
