/**
 * Build C8.5's two deliverables: the one-page summary and the build document.
 *
 *   node scripts/artifacts/buildC85Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertServiceHoldsNoArtifact. C8.5's acceptance is
 * "links only, no duplication", and the way that quietly stops being true is a later
 * edit adding a convenience fetch or a cached copy. The build reads the shipped service
 * and the shipped DDL and refuses to produce a document claiming "links only" if either
 * has gained a network call or a content column.
 */
const path = require('path');
const D = require('./tickets/c85Data');
const R = require('./tickets/c85Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.5');

async function main() {
  const kinds = D.assertSevenKinds();
  const forbidden = D.assertServiceHoldsNoArtifact();
  const rules = D.assertEveryC03RuleIsHonored();

  const jobs = [
    { file: 'C85_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C85_2_ACCOUNT_ARTIFACT_LINKS.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  artifact kinds        : ' + kinds + ', parsed from the ensure file');
  console.log('  content words refused : ' + forbidden);
  console.log('  C0.3 rules honored    : ' + rules);
  console.log('  service network calls : 0  -- asserted against the shipped source');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
