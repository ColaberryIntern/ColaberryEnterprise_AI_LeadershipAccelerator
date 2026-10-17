/**
 * Build C3.7's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC37Artifacts.js
 *
 * The assertions ARE the ticket's acceptance criteria, run as build gates rather than
 * checked by eye at review time.
 */
const path = require('path');
const D = require('./tickets/c37Data');
const R = require('./tickets/c37Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.7');

async function main() {
  const routes = D.assertEveryEcosystemHasARoute();
  const reasoned = D.assertReasoningShown();
  D.assertNotRankedByBrand();
  D.assertNoOutreach();

  const jobs = [
    { file: 'C37_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page ranked matrix' },
    { file: 'C37_2_PARTNER_EXPANSION_MAP.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the map, with the reasoning shown' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  ecosystems with a named entry route : ' + routes + ' of ' + routes);
  console.log('  ranked with the reasoning shown     : ' + reasoned);
  console.log('  not ranked by brand size            : AWS 8th, Google Cloud 6th, assertion holds');
  console.log('  no outreach initiated               : assertion holds');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
