/**
 * Build C3.4's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC34Artifacts.js
 */
const path = require('path');
const D = require('./tickets/c34Data');
const R = require('./tickets/c34Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.4');

async function main() {
  const probe = D.assertAbsenceProven();
  D.assertCorrectionsPreserved();

  const jobs = [
    { file: 'C34_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C34_2_OPENAI_ROUTE.pdf', html: R.buildDocument(), landscape: false, maxPages: 0,
      margin: '15mm', what: 'the opportunity brief' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(26) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  controls recorded   : ' + probe.controls + ' (both directions)');
  console.log('  urls in probe log   : ' + probe.probes);
  console.log('  absences claimed    : ' + probe.absences + ', each backed by a 404 or NXDOMAIN');
  console.log('  corrections carried : 2 of 2');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
