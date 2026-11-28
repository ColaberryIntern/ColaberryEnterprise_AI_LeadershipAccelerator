/**
 * Build one Voice AI Studio ticket's two PDFs: the one-page landscape VISUAL (posted first) and
 * the DOCUMENT. Data lives in tickets/vsData.js, keyed by ticket code.
 *
 *   ARTIFACT_CHROMIUM="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
 *     node scripts/artifacts/buildVsArtifacts.js VS0.1
 *
 * Output: docs/artifacts/<code>/ (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/vsRender');
const DATA = { ...require('./tickets/vsData'), ...require('./tickets/vsData3'), ...require('./tickets/vsData4'), ...require('./tickets/vsData5') };

async function main() {
  const code = process.argv[2];
  const e = DATA[code];
  if (!e) throw new Error(`no vsData entry for "${code}" (have: ${Object.keys(DATA).join(', ')})`);
  const slug = code.replace('.', '');
  const out = path.join(__dirname, '..', '..', 'docs', 'artifacts', code);
  const v = await renderPdf({ html: R.buildVisual(e), outPath: path.join(out, `${slug}_VISUAL_1PAGE.pdf`), landscape: true, maxPages: 1, margin: '8mm' });
  const d = await renderPdf({ html: R.buildDocument(e), outPath: path.join(out, `${slug}_${e.docName}.pdf`), margin: '15mm' });
  console.log(`visual  ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`doc     ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
}

main().catch((err) => { console.error('BUILD FAILED: ' + err.message); process.exit(1); });
