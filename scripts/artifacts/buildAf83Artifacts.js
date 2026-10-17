/**
 * Build AF8.3's go / no-go page and runbook.
 *
 *   node scripts/artifacts/buildAf83Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af83Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF8.3');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF83_MONDAY_GO_NO_GO_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF83_MONDAY_KICKOFF_RUNBOOK.pdf'),
    margin: '15mm',
  });
  console.log(`go/no-go ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`runbook  ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
