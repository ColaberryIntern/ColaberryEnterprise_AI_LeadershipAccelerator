/**
 * Build C9.4's two deliverables: the one-page runbook and the full conversion process.
 *
 *   node scripts/artifacts/buildC94Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertStageNamesMatchC84, which reads funnelStages.ts off
 * disk rather than trusting a copy. "Stage names match C8.4 exactly" is an acceptance
 * criterion, and a runbook that has quietly drifted from the instrumentation is worse
 * than one that never claimed to match: the drift is invisible until somebody tries to
 * measure the funnel against the process and finds the stages do not line up.
 *
 * assertNoInventedDiscount is the second. The ticket assigns the discount decision to
 * Ali, and C2.3 already made it. A second number in this document would have created two
 * approved limits, which is worse than having none.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c94Data');
const R = require('./tickets/c94Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C9.4');
const FUNNEL = path.join(__dirname, '..', '..', 'backend', 'src', 'services',
  'commercialization', 'funnelStages.ts');

async function main() {
  const stages = D.assertStageNamesMatchC84(() => fs.readFileSync(FUNNEL, 'utf8'));
  const steps = D.assertEveryStepIsOwnedTimedAndExitable();
  const approved = D.assertConcessionsAreExplicit();
  D.assertNoInventedDiscount();
  D.assertTheMeasurementGapIsDeclared();

  const jobs = [
    { file: 'C94_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C94_2_DEMO_TO_PILOT_RUNBOOK.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
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
  console.log('  stage references    : ' + stages + ', every one matched against funnelStages.ts');
  console.log('  steps               : ' + steps + ', each with an owner, timebox and exit');
  console.log('  concession levers   : ' + D.CONCESSIONS.length + ', of which '
    + approved + ' approved');
  console.log('  discount            : ' + D.PRICING.discountHeadroomPct + '% of $'
    + D.PRICING.pilotPrice.toLocaleString() + ', max $'
    + D.MAX_DISCOUNT_DOLLARS.toLocaleString() + '  (C2.3, carried)');
  console.log('  success metric      : ' + D.MEASUREMENT_GAP.verdict);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
