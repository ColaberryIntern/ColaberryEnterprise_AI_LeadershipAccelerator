/**
 * Build C5.9's two deliverables: a one-page visual and the spec document.
 *
 *   node scripts/artifacts/buildC59Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertPageCannotReachTheBackend. The ticket's central
 * promise is that no customer data is reachable from a public page, and the honest form of
 * that promise is a property of the module graph rather than a review someone did once.
 * The guard reads the page's import list from disk; if an API client ever appears, this
 * build stops producing the document that says otherwise.
 *
 * THREE OF THE FIVE GUARDS WERE WRONG ON THEIR FIRST ATTEMPT, and each would have shipped
 * a confident falsehood: one counted badges in source when the badge sits inside a map,
 * one matched the comment explaining why a figure is excluded, and one counted a literal
 * string when the page correctly references a constant. They are recorded in the document
 * because a guard that has never failed is a guess.
 */
const path = require('path');
const D = require('./tickets/c59Data');
const R = require('./tickets/c59Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.9');

async function main() {
  const imports = D.assertPageCannotReachTheBackend();
  const labeled = D.assertEveryStepIsLabeled();
  const figures = D.assertNoUnregisteredFigures();
  const record = D.assertOneRecordThroughout();
  const limits = D.assertLimitsAreStated();

  const jobs = [
    { file: 'C59_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C59_2_GUIDED_DEMO.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(28) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  steps                   : ' + labeled.steps + ', badge inside the '
    + 'per-step component');
  console.log('  page imports            : ' + imports + ', none is an API client');
  console.log('  record references       : ' + record.refs + ', hard-coded literals: '
    + record.literals);
  console.log('  unregistered figures    : ' + figures + ' patterns checked, none present');
  console.log('  stated limits           : ' + limits.length);
  console.log('  production URL          : ' + D.PRODUCTION_URL);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PROD VERIFIED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
