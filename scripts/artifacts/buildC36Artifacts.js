/**
 * Build C3.6's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC36Artifacts.js
 */
const path = require('path');
const D = require('./tickets/c36Data');
const R = require('./tickets/c36Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.6');

async function main() {
  const refuted = D.assertRefutationKept();
  const tiers = D.assertTiered();
  const amends = D.assertAmendmentsDeclared();

  const jobs = [
    { file: 'C36_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page visual' },
    { file: 'C36_2_OPENAI_TARGET_MAP.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the target map and intro strategy' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('\n  targets ranked    : ' + tiers.targets + ' across tiers ' + tiers.tiers.join(', '));
  console.log('  refuted links kept: ' + refuted);
  console.log('  amendments to C3.4: ' + amends);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
