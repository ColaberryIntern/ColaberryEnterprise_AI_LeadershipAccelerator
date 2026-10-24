/**
 * Build C8.7's two deliverables: the one-page design and the full integration document.
 *
 *   node scripts/artifacts/buildC87Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertDocumentDeclinesTheOutcomeMeasure. The whole
 * design rests on the ladder and C7.6 agreeing that a business-outcome claim is not
 * ours to make, and the way that quietly stops being true is a later edit giving that
 * measure a verification class so it looks merely unchecked. The build refuses it.
 */
const path = require('path');
const D = require('./tickets/c87Data');
const R = require('./tickets/c87Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.7');

async function main() {
  const measures = D.assertFiveMeasuresParsed();
  const declined = D.assertDocumentDeclinesTheOutcomeMeasure();
  const facts = D.assertEveryFactIsSourced();

  const jobs = [
    { file: 'C87_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C87_2_PILOT_TO_CASE_STUDY.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(34) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const publishable = D.MAPPINGS.filter((m) => m.publishable).length;
  console.log('');
  console.log('  C7.6 measures mapped  : ' + measures + ', parsed from the policy module');
  console.log('  publishable in a study: ' + publishable + ' of ' + measures);
  console.log('  declined outright     : ' + declined.measure);
  console.log('  engine facts sourced  : ' + facts + ', each cited to a file');
  console.log('  pilots run            : ' + D.MEASURED.pilotsRun);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
