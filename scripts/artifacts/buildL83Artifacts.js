/**
 * Build the artifacts for L8.3 criterion 3 — mutation evidence for the replay entitlement filter.
 *
 * The record is written, then checked, then rendered. Nothing renders if the check fails: the
 * criterion is evidence, and a PDF that renders beautifully over a test name that no longer
 * exists is worse than no artifact, because it will be attached to a ticket and believed.
 *
 *   node scripts/artifacts/buildL83Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L8.3');

async function main() {
  const doc = require('./tickets/l83Document');
  const D = require('./tickets/l83Data');
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
    + `${D.BASELINE.tests} tests), ${D.TOTALS.mutations} reversals all decided, `
    + `${D.TOTALS.killed} killed / ${D.TOTALS.survived} survived, `
    + `${D.TOTALS.distinctTests} named tests all present in the test sources, `
    + 'the mutated function unchanged since the run');

  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, 'L83_REPLAY_FILTER_MUTATION_EVIDENCE.pdf');
  const res = await renderPdf({
    html: doc.build(), outPath, landscape: false, maxPages: 0, margin: '12mm',
  });
  console.log(`L83_REPLAY_FILTER_MUTATION_EVIDENCE.pdf: ${res.pages} page(s)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
