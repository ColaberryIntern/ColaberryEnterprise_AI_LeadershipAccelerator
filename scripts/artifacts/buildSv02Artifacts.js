/**
 * Build SV0.2's one-page visual and manifest document (Services Upgrade, Basecamp todo 10506775194).
 *
 *node scripts/artifacts/buildSv01Artifacts.js
 *
 * Output: docs/artifacts/SV0.2 (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/sv02Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'SV0.2');

async function main() {
  const v = await renderPdf({ html: R.buildVisual(), outPath: path.join(OUT, 'SV0.2_VISUAL_1PAGE.pdf'), landscape: true, maxPages: 1, margin: '8mm' });
  const d = await renderPdf({ html: R.buildDocument(), outPath: path.join(OUT, 'SV0.2_MANIFEST_DOCUMENT.pdf'), margin: '15mm' });
  console.log(`visual  ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`doc     ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
