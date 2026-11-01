/**
 * Build AF4.5's one-page visual and its spec document.
 *
 *   node scripts/artifacts/buildAf45Artifacts.js
 *   node scripts/artifacts/buildAf45Artifacts.js --preview   # also write a PNG and audit it
 *
 * Output: docs/artifacts/AF4.5 (gitignored - the repo is public and artifacts never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const { previewPage } = require('./previewArtifactPage');
const R = require('./tickets/af45Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF4.5');
const MARGIN_MM = 9;

async function main() {
  // Preview FIRST when asked. The page-count gate says only THAT a one-pager overflowed; the
  // preview says by how much and which block is costing the page. Then look at the PNG, because
  // neither gate can tell you the layout reads wrong.
  if (process.argv.includes('--preview')) {
    const p = await previewPage({
      html: R.buildVisual(),
      outPath: path.join(OUT, 'AF45_visual_preview.png'),
      landscape: true,
      marginMm: MARGIN_MM,
    });
    if (!p.fits) {
      console.error(`\nThe visual overflows by ${p.overflowBy}px. Cut the block costing the most above.`);
      process.exit(1);
    }
  }

  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'AF45_INTERN_DEV_ENVIRONMENT_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
    margin: `${MARGIN_MM}mm`,
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'AF45_INTERN_DEV_ENVIRONMENT_SPEC.pdf'),
    margin: '15mm',
  });
  console.log(`visual  ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB  mermaid=${v.mermaid}`);
  console.log(`spec    ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB  mermaid=${d.mermaid}`);
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
