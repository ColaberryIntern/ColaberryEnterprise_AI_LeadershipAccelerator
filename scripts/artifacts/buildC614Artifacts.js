/**
 * Build C6.14's two deliverables: the approval one-pager and the full copy document.
 *
 *   node scripts/artifacts/buildC614Artifacts.js
 *
 * THE GUARDS ARE THE POINT. C6.14's acceptance criteria say no variant may use the word "free",
 * claim a certification, or quote an unregistered figure. Those are checkable, so they are
 * checked: the build fails rather than producing a document that breaks one of them.
 *
 * The one that earns its keep is assertNoUnregisteredFigure. It pulls every numeral out of every
 * rendered letter and demands each one be a measured figure whose registry row is not null. That
 * catches the failure this ticket was most likely to ship, which is not a made-up number but a
 * true one: 808,202 executions over thirty days is measured and correct and has no registry row,
 * because CLM-006 is defined on seven days.
 *
 * assertNoAttestationWasWritten is the other one worth naming. Only Ali can set the two
 * activation gates, so the build refuses to produce an approval document if either has stopped
 * reading false.
 */
const path = require('path');
const D = require('./tickets/c614Data');
const C = require('./tickets/c614Copy');
const G = require('./tickets/c614Guards');
const R = require('./tickets/c614Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.14');

async function main() {
  const letters = G.assertAllGuards();

  const jobs = [
    { file: 'C614_1_APPROVAL_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true,
      maxPages: 1, margin: '10mm' },
    { file: 'C614_2_COPY_AND_CLAIM_TRACE.pdf', html: R.buildDocument(), landscape: false,
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

  const usable = Object.values(D.MEASURED).filter((m) => m.clm).length;
  const unusable = Object.entries(D.MEASURED).filter(([, m]) => !m.clm).map(([k]) => k);
  const met = G.criteria().filter((c) => c.verdict === 'MET').length;

  console.log('');
  console.log('  variants         : ' + C.VARIANTS.length
    + '  -> ' + C.VARIANTS.map((v) => v.id).join(', ') + '  (written here; none existed)');
  console.log('  companies written: ' + Object.keys(C.COMPANIES).length
    + '  excluded ' + Object.keys(C.EXCLUDED).length
    + '  -> ' + Object.keys(C.EXCLUDED).join(', '));
  console.log('  letters rendered : ' + letters);
  console.log('  figures measured : ' + Object.keys(D.MEASURED).length
    + '  usable ' + usable + '  NO REGISTRY ROW ' + unusable.length
    + '  -> ' + unusable.join(', '));
  console.log('  7-day rate       : ' + D.RATE_7D.toFixed(2) + '% over '
    + D.MEASURED.executions7d.value.toLocaleString('en-US') + ' executions');
  console.log('  claims traced    : ' + D.TRACEABILITY.length);
  console.log('  criteria met     : ' + met + ' of ' + G.criteria().length
    + '  (two are Ali\'s attestations and cannot be met here)');
  console.log('  open flags       : ' + D.FLAGS.length);
  console.log('');
  console.log('  campaign         : ' + D.CAMPAIGN.status + '/' + D.CAMPAIGN.qaStatus
    + ', gates ' + JSON.stringify(D.CAMPAIGN.activationGate)
    + ', ' + D.CAMPAIGN.touchpoints + ' touchpoints, ' + D.CAMPAIGN.enrolled + ' enrolled');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
