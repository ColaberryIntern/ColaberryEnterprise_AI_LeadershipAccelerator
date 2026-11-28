/**
 * Build the one-page visual and the completion document for each of the five Agent Factory
 * tickets closed on 2026-11-27.
 *
 *   node scripts/artifacts/buildAfCloseoutArtifacts.js
 *
 * Ten PDFs, two per ticket, every one distinct: the close gate counts a PDF by its bytes, and a
 * recycled visual is exactly what that rule exists to catch.
 *
 * Output: docs/artifacts/AF-CLOSEOUT-2026-11-27 (gitignored; the repo is public and artifacts
 * never land in it).
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/afCloseoutRender');
const { TICKETS } = require('./tickets/afCloseoutData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF-CLOSEOUT-2026-11-27');

async function main() {
  for (const key of Object.keys(TICKETS)) {
    const t = TICKETS[key];
    const v = await renderPdf({
      html: R.buildVisual(key),
      outPath: path.join(OUT, `${t.slug}_1PAGE.pdf`),
      landscape: true,
      maxPages: 1,
      margin: '9mm',
    });
    const d = await renderPdf({
      html: R.buildDocument(key),
      outPath: path.join(OUT, `${t.slug}_COMPLETION.pdf`),
      margin: '15mm',
    });
    console.log(
      `${t.code.padEnd(8)} visual ${v.pages}p ${(v.bytes / 1024).toFixed(0).padStart(4)}KB`
      + `   completion ${d.pages}p ${(d.bytes / 1024).toFixed(0).padStart(4)}KB`,
    );
  }
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
