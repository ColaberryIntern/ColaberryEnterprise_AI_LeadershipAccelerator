/**
 * Build C4.13's two deliverables: the one-page summary and the full evidence audit.
 *
 *   node scripts/artifacts/buildC413Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertNoOutcomeIsAsserted. This is a funder document, and
 * the failure mode is not laziness but fluency: a brief is exactly where good writing
 * outruns the evidence. The build refuses to produce a document that asserts a learner
 * outcome, because no learner outcome has been measured.
 *
 * assertNoCostPerPersonIsQuoted is the second, for the same reason C4.8 locks the burn:
 * the ticket asks for a cost per person, and the only way to supply one today would be
 * to invent it.
 */
const path = require('path');
const D = require('./tickets/c413Data');
const R = require('./tickets/c413Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.13');

async function main() {
  const defensible = D.assertNoOutcomeIsAsserted();
  D.assertEveryDefensibleFactHasABasis();
  const unsourced = D.assertRecognitionSourcingIsStated();
  const risks = D.assertEveryLiveRiskCitesItsLocation();
  D.assertNoCostPerPersonIsQuoted();

  const jobs = [
    { file: 'C413_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C413_2_FUNDER_EVIDENCE_AUDIT.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(40) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  spine claim          : ' + D.SPINE.verdict
    + '  -- measured, both halves fail');
  console.log('  award rows unsourced : ' + unsourced + ' of ' + D.RECOGNITIONS.length);
  console.log('  live unsourced claims: ' + risks + ', each citing a file');
  console.log('  defensible facts     : ' + defensible + ', every one measured or registry-backed');
  console.log('  cost per person      : ' + D.COST_PER_PERSON.verdict);
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
