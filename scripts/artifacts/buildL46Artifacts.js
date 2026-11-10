/**
 * Build the artifacts for L4.6 criteria 4 and 5 — the measurement path, mutated and planned.
 *
 * The record is written, then checked, then rendered. Nothing renders if the check fails: the
 * criteria are evidence, and a PDF that renders beautifully over a test name that no longer
 * exists is worse than no artifact, because it will be attached to a ticket and believed.
 *
 *   node scripts/artifacts/buildL46Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L4.6');

async function main() {
  const doc = require('./tickets/l46Document');
  const D = require('./tickets/l46Data');
  const P = require('./tickets/l46PlanData');
  const F = require('./tickets/l46Findings');
  const abs = path.join(ROOT, D.META.file);

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const md = doc.markdown();
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (md !== before) {
    fs.writeFileSync(abs, md, 'utf8');
    console.log(`${D.META.file}: ${md.split('\n').length} lines written (committed)`);
  } else {
    console.log(`${D.META.file}: already current`);
  }

  doc.selfCheck();
  console.log(`self-check passed: baseline green (${D.BASELINE.suites} suites, `
    + `${D.BASELINE.tests} tests, ${D.BASELINE.pending} skipped), `
    + `${D.TOTALS.mutations} reversals all decided, ${D.TOTALS.killed} killed / `
    + `${D.TOTALS.survived} survived, both criterion-named reversals present, `
    + `${D.TOTALS.distinctTests} named tests all present in the test sources, `
    + `${F.TOTALS.findings} findings, ${P.STAGES.length} query plans each carrying its row `
    + 'counts, both mutated regions unchanged since the run');

  fs.mkdirSync(OUT, { recursive: true });

  /**
   * The VISUAL is rendered first, because that is the order it is read in: one page to decide
   * whether the criteria are discharged, then the record behind it. `maxPages: 1` is the claim
   * being made — the renderer throws rather than spilling, so a clean exit is the proof.
   */
  const vis = require('./tickets/l46Visual');
  const v = vis.selfCheck();
  console.log(`visual self-check passed: ${v.killed}/${v.mutations} killed with `
    + `${v.narrow} resting on a single assertion, ${v.stages} plan stages each with a verdict, `
    + `${v.findings} findings, and the zero-rows caveat present`);
  const visPath = path.join(OUT, 'L46_MEASUREMENT_PATH_VISUAL.pdf');
  const vres = await renderPdf({
    html: vis.build(), outPath: visPath, landscape: true, maxPages: 1, margin: '10mm',
  });
  console.log(`L46_MEASUREMENT_PATH_VISUAL.pdf: ${vres.pages} page(s)`);

  const outPath = path.join(OUT, 'L46_TELEMETRY_MUTATION_AND_PLAN_EVIDENCE.pdf');
  const res = await renderPdf({
    html: doc.build(), outPath, landscape: false, maxPages: 0, margin: '12mm',
  });
  console.log(`L46_TELEMETRY_MUTATION_AND_PLAN_EVIDENCE.pdf: ${res.pages} page(s)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
