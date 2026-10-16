/**
 * Build C4.8's three deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC48Artifacts.js
 *
 * The ticket asks for "an executive strategy document plus a presentation"; the standing rule
 * adds the one-page visual. Per Ali's correction of 16 October 2026, each item is its own PDF
 * rather than one combined file.
 */
const path = require('path');
const D = require('./tickets/c48Data');
const R = require('./tickets/c48Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.8');

async function main() {
  const counts = D.assertTagged();
  D.assertBurnUnknown();

  const jobs = [
    { file: 'C48_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C48_2_HOW_WE_MAKE_MONEY.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the executive strategy document' },
    { file: 'C48_3_PRESENTATION.pdf', html: R.buildPresentation(), landscape: false,
      maxPages: 0, margin: '14mm', what: 'the presentation, one slide per page' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  mermaid=' + r.mermaid + '  -- ' + j.what);
  }

  console.log('\n  questions answered    : ' + counts.questions + ' of 20');
  console.log('  economic lines tagged : ' + counts.econ);
  console.log('  operating burn        : UNKNOWN, assertion holds');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
