/**
 * Build C8.1's three deliverables: two PDFs for the ticket and the HTML prototype.
 *
 *   node scripts/artifacts/buildC81Artifacts.js
 *
 * The HTML goes in the 08 folder rather than on the ticket, because Basecamp does not
 * preview HTML and an unpreviewable attachment is one nobody opens.
 *
 * The assertion that matters is assertNoMockedNumbers: the ticket's criterion is that a
 * tile with no source is marked rather than mocked, and this is that rule as code. The
 * second is assertPrototypeUsesRealTokens, which reads the app's own stylesheet so
 * "reuses the existing admin design system" is checked rather than claimed.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c81Data');
const R = require('./tickets/c81Render');
const P = require('./tickets/c81Prototype');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.1');

async function main() {
  const required = D.assertRequiredMetricsPresent();
  const sourced = D.assertEveryTileNamesASource();
  const live = D.assertNoMockedNumbers();
  const tally = D.assertHeadlineMatchesTiles();

  const html = P.build();
  const tokens = D.assertPrototypeUsesRealTokens(html);

  fs.mkdirSync(OUT, { recursive: true });
  const htmlPath = path.join(OUT, 'C81_3_COMMAND_CENTER_PROTOTYPE.html');
  fs.writeFileSync(htmlPath, html);
  console.log('  ' + path.basename(htmlPath).padEnd(40)
    + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB  (folder, not the ticket)');

  const jobs = [
    { file: 'C81_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C81_2_COMMAND_CENTER_ARCHITECTURE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '14mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(40) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  required metrics all present : ' + required);
  console.log('  tiles naming a data source   : ' + sourced);
  console.log('  tiles carrying a real number : ' + live + ' (the rest are marked, not mocked)');
  console.log('  tile tally                   : ' + tally);
  console.log('  design tokens, all real      : ' + tokens + ' distinct, verified against tokens.css');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
