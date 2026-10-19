/**
 * Build the four deliverables for C7.5 and C7.6, one PDF each.
 *
 *   node scripts/artifacts/buildC75C76Artifacts.js
 *
 * Two assertions carry the weight. assertUnprovenIsFlagged refuses to build if Demo Day or
 * the executive report stops being marked unproven, or if the stale "0 of 46" figure from
 * the ticket brief is repeated. assertAttributionHonest refuses to let a measure claim
 * strong attribution without resting on the commit link, and requires that business
 * outcome stays explicitly declined.
 */
const path = require('path');
const D = require('./tickets/c75c76Data');
const R = require('./tickets/c75c76Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts');

const JOBS = [
  { id: 'c75', dir: 'C7.5', file: 'C75_1_ONE_PAGE.pdf', visual: true },
  { id: 'c75', dir: 'C7.5', file: 'C75_2_PILOT_PLAYBOOK.pdf', visual: false },
  { id: 'c76', dir: 'C7.6', file: 'C76_1_ONE_PAGE.pdf', visual: true },
  { id: 'c76', dir: 'C7.6', file: 'C76_2_MEASUREMENT_FRAMEWORK.pdf', visual: false },
];

async function main() {
  const phases = D.assertEveryPhaseHasOwnerAndGate();
  const failures = D.assertFailurePathsWritten();
  const unproven = D.assertUnprovenIsFlagged();
  const strong = D.assertAttributionHonest();
  const measured = D.assertProductionFiguresDated();

  for (const j of JOBS) {
    const html = j.visual ? R.buildVisual(j.id) : R.buildDocument(j.id);
    const r = await renderPdf({
      html,
      outPath: path.join(OUT, j.dir, j.file),
      landscape: j.visual,
      maxPages: j.visual ? 1 : 0,
      margin: j.visual ? '10mm' : '14mm',
    });
    console.log('  ' + (j.dir + '/' + j.file).padEnd(40) + r.pages + ' page(s)'
      + (j.visual ? ' (limit 1)' : '') + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  phases, each with an owner and a gate : ' + phases);
  console.log('  phases flagged UNPROVEN               : ' + unproven
    + ' (Demo Day and the executive report)');
  console.log('  failure paths with a threshold        : ' + failures);
  console.log('  measures with STRONG attribution      : ' + strong + ' of '
    + D.MEASURES.length + ', and business outcome explicitly declined');
  console.log('  production figures, each with meaning : ' + measured);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
