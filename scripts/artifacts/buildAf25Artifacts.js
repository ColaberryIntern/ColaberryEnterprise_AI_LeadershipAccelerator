/**
 * Build AF2.5's two PDFs: the one-page grant plan and the access ledger.
 *
 *   node scripts/artifacts/buildAf25Artifacts.js
 *
 * Nothing here touches the database. The ledger is a PROPOSAL; the grants it describes are
 * reserved to Ali by name on the ticket.
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af25Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF2.5');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF25_INTERN_ACCESS_LEDGER_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF25_INTERN_ACCESS_LEDGER.pdf'),
    landscape: false,
    margin: '15mm',
  });
  console.log(`visual   ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  `
    + `mermaid=${v.mermaid}`);
  console.log(`document ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  `
    + `mermaid=${d.mermaid}`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
