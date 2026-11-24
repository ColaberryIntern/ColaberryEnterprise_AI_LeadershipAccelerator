/**
 * Build AF11.13's one-page visual and its completion document.
 *
 *   node scripts/artifacts/buildAf1113Artifacts.js
 *
 * Output: docs/artifacts/AF11.13 (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af1113Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF11.13');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF1113_DECISION_PACKAGE_DRAFTING_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '9mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF1113_DECISION_PACKAGE_DRAFTING_COMPLETION.pdf'),
    margin: '15mm',
  });
  console.log(`visual      ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB`);
  console.log(`completion  ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
