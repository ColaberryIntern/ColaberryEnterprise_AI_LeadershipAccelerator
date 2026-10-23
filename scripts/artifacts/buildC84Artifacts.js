/**
 * Build C8.4's two deliverables: the one-page funnel map and the full definitions doc.
 *
 *   node scripts/artifacts/buildC84Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertParseIsComplete. These definitions are read out of
 * funnelStages.ts rather than retyped, so the document cannot drift from the code the
 * weekly number is computed from. The failure mode of a parse is silent - a formatting
 * change makes the regex miss and the document renders with six stages, looking fine -
 * so the build refuses anything that is not ten complete stages.
 *
 * THE SECOND ONE IS THE DEFINITION ALI HAS TO RULE ON. Engagement excludes opens and
 * clicks, which is the difference between reporting 47 engaged and 19,729. The build
 * refuses a document whose engaged trigger has quietly widened, because that number
 * would be believed.
 */
const path = require('path');
const D = require('./tickets/c84Data');
const R = require('./tickets/c84Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.4');

async function main() {
  const parsed = D.assertParseIsComplete();
  const engaged = D.assertOpensAreExcludedInTheDocument();
  const absent = D.assertAbsentStagesSaySo();

  const jobs = [
    { file: 'C84_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C84_2_FUNNEL_STAGE_DEFINITIONS.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(38) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  stages parsed from code : ' + parsed + '  (not retyped)');
  console.log('  engaged fires on        : ' + engaged.trigger);
  console.log('  engaged excludes        : opens (13,892) and clicks (5,837)');
  console.log('  uncountable today       : ' + absent.join(', '));
  console.log('  strategic accounts      : ' + D.MEASURED.strategicAccounts
    + '  -- the funnel genuinely starts empty');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
