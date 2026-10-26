/**
 * Build C8.11's two deliverables: the one-page finding and the full handover audit.
 *
 *   node scripts/artifacts/buildC811Artifacts.js
 *
 * THE ASSERTION THAT MATTERS is assertThePremiseCorrectionSurvives. This ticket says no
 * handover flow exists and one exists end to end, so the single most valuable sentence in
 * the artifact is the correction. If an edit ever softened it into "the flow is
 * incomplete", the next reader would build the duplicate the ticket's own warning is
 * about, and the build refuses to produce that document.
 *
 * assertTheDeploymentRefusalIsNamedAsGovernance is the second. The unconditional refusal
 * in releaseGate.ts is a decision with a review attached, not an oversight, and a
 * document that described it as a gap would invite somebody to close it quietly.
 */
const path = require('path');
const D = require('./tickets/c811Data');
const R = require('./tickets/c811Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.11');

async function main() {
  const total = D.assertEveryVerdictIsBinaryAndActionable();
  D.assertThePremiseCorrectionSurvives();
  D.assertTheDeploymentRefusalIsNamedAsGovernance();
  D.assertTheDisconnectIsStated();

  const jobs = [
    { file: 'C811_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C811_2_HANDOVER_FLOW_AUDIT.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
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

  const met = D.CRITERIA.filter((c) => c.verdict === 'MET').length;
  console.log('');
  console.log('  criteria            : ' + total + ', ' + met + ' met');
  console.log('  pieces already built: ' + D.EXISTING.length);
  console.log('  delivery releases   : ' + D.MEASURED.deliveryReleases
    + '  -- the flow exists and has never been run');
  console.log('  verified projects   : ' + D.MEASURED.verifiedStudentProjects
    + ', linked to a delivery project: ' + D.MEASURED.verifiedProjectsLinkedToDelivery);
  console.log('  decisions for Ali   : ' + D.DECISIONS.length + ' ('
    + D.DECISIONS.map((d) => d.kind.toLowerCase()).join(', ') + ')');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
