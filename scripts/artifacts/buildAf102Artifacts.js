/**
 * Build AF10.2's one-page visual and its spec document.
 *
 *   node scripts/artifacts/buildAf102Artifacts.js
 *
 * Output: docs/artifacts/AF10.2 (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af102Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF10.2');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF102_ACCEPTANCE_CRITERIA_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '9mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF102_ACCEPTANCE_CRITERIA_SPEC.pdf'),
    margin: '15mm',
  });
  console.log(`visual  ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`spec    ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
