/**
 * Build AF2.2's blocker map and document.
 *
 *   node scripts/artifacts/buildAf22Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af22Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF2.2');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF22_AGENT_CONSOLE_BLOCKERS_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF22_AGENT_CONSOLE.pdf'),
    margin: '15mm',
  });
  console.log(`blockers ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`document ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
