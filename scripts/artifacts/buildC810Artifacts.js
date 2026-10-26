/**
 * Build C8.10's two deliverables: the one-page summary and the full report.
 *
 *   node scripts/artifacts/buildC810Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertNoCriterionIsMetOnMechanismAlone. This ticket names
 * its own failure mode - "a table with the right shape and zero records reads as
 * capability and is not" - and the way that failure would actually happen here is a
 * criterion marked met because the query was written. The build refuses to produce that
 * document. assertTheZeroIsExplained is the second: without it, an edit could leave a
 * report that says zero learners and reads as a fact about the audience rather than about
 * the instrument.
 */
const path = require('path');
const D = require('./tickets/c810Data');
const R = require('./tickets/c810Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.10');

async function main() {
  const total = D.assertEveryVerdictIsBinaryAndActionable();
  const met = D.assertNoCriterionIsMetOnMechanismAlone();
  D.assertTheZeroIsExplained();
  const probes = D.assertTheProbeShowsBothSides();

  const jobs = [
    { file: 'C810_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C810_2_LIVE_POPULATION_INSTRUMENTATION.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(46) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  criteria            : ' + total);
  console.log('  MET                 : ' + met);
  console.log('  NOT MET             : ' + (total - met) + '  -- neither on engineering');
  console.log('  cloudflare probes   : ' + probes + ', showing a working call and the blocked one');
  console.log('  viewer rows in prod : ' + D.MEASURED.viewerPeopleRows
    + '  -- explained by the 9-18 Oct beat-write outage, not by the audience');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
