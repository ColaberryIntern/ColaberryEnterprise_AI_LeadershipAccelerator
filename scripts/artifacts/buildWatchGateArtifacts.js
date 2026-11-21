/**
 * Build the watch-gate to-do's one-page visual and its status document.
 *
 *   node scripts/artifacts/buildWatchGateArtifacts.js
 *
 * Output: docs/artifacts/WATCH-GATE (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/watchGateRender');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'WATCH-GATE');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'WATCH_GATE_DECISION_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '9mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'WATCH_GATE_STATUS.pdf'),
    margin: '15mm',
  });
  console.log(`visual   ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB`);
  console.log(`document ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
