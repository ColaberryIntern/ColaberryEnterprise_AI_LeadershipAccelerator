/**
 * Build SV0.3's one-page visual and its document (Services Upgrade, Basecamp todo 10506775213).
 *
 *node scripts/artifacts/buildSv01Artifacts.js
 *
 * Output: docs/artifacts/SV0.3 (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/sv03Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'SV0.3');

async function main() {
  const v = await renderPdf({ html: R.buildVisual(), outPath: path.join(OUT, 'SV0.3_M1_DECISION_1PAGE.pdf'), landscape: true, maxPages: 1, margin: '8mm' });
  const d = await renderPdf({ html: R.buildDocument(), outPath: path.join(OUT, 'SV0.3_TAXONOMY_DOCUMENT.pdf'), margin: '15mm' });
  console.log(`visual  ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`doc     ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
