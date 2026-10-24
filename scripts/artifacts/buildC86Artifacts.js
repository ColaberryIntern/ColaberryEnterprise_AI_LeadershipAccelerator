/**
 * Build C8.6's two deliverables: the one-page board and the full document.
 *
 *   node scripts/artifacts/buildC86Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertEveryKillConditionIsDated. C8.6's acceptance is
 * that every hypothesis has an EXPLICIT kill condition, and the way that quietly stops
 * being true is a later edit softening one into "kill if this is not working". A
 * condition with no date never fires, so the build refuses a document containing one.
 *
 * THE SECOND IS assertNoPriceIsQuoted. C0.1 leaves every price and buyer UNKNOWN on
 * purpose and says why: estimates would make the register useless as a test. A document
 * that quietly supplied one would undo that.
 */
const path = require('path');
const D = require('./tickets/c86Data');
const R = require('./tickets/c86Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.6');

async function main() {
  const parsed = D.assertFiveHypothesesParsed();
  const dated = D.assertEveryKillConditionIsDated();
  D.assertNoPriceIsQuoted();
  const clean = D.assertNoLabelIsContaminated();

  const jobs = [
    { file: 'C86_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C86_2_HYPOTHESIS_HEALTH.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const soonest = Math.min(...Object.values(D.OBSERVED.verdicts).map((v) => v.daysLeft));
  console.log('');
  console.log('  hypotheses parsed     : ' + parsed + ', from the shipped register');
  console.log('  dated kill conditions : ' + dated + ' of ' + parsed);
  console.log('  labels uncontaminated : ' + clean + '  (comments stripped before parsing)');
  console.log('  with any evidence     : 0 of ' + parsed);
  console.log('  soonest deadline      : ' + soonest + ' days');
  console.log('  strategic accounts    : ' + D.OBSERVED.strategicAccounts);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
