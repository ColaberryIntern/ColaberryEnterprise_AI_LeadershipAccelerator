/**
 * Build C5.7's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC57Artifacts.js
 *
 * The assertion that matters is assertProbesAreTwoWay. This artifact's entire job is to
 * prove a page is live in production, and the obvious proof - a 200 from the URL - is
 * worthless here, because the app serves index.html for every path including paths that
 * have never existed. A verification with only PRESENT probes would read as evidence while
 * being none, so the build refuses one.
 */
const path = require('path');
const D = require('./tickets/c57Data');
const R = require('./tickets/c57Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.7');

async function main() {
  const probes = D.assertProbesAreTwoWay();
  const status = D.assertStatusCodeTrapIsStated();
  const crit = D.assertUnmetCriteriaAreAdmitted();
  const manifest = D.assertManifestIsComplete();

  const jobs = [
    { file: 'C57_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C57_2_HIGHER_ED_PAGE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  route                    : ' + D.PAGE.route);
  console.log('  production URL           : ' + D.PAGE.productionUrl);
  console.log('  status-code channel      : UNUSABLE, both the real and the nonsense path '
    + 'return ' + status);
  console.log('  bundle probes            : ' + probes.present + ' present, '
    + probes.absent + ' absent, all as expected');
  console.log('  deployed commit          : ' + D.DEPLOYED_COMMIT.slice(0, 12)
    + ', has PR ' + D.PAGE.pr + ' as an ancestor');
  console.log('  acceptance criteria      : ' + crit.met + ' of ' + crit.total + ' met, '
    + crit.unmet + ' admitted unmet');
  console.log('  manifest fields          : ' + manifest + ', all present');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PROD VERIFIED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
