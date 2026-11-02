/**
 * Build the artifacts for L0.4, the Colaberry Live traceability matrix.
 *
 * TWO PDFs from ONE data module: the one-page visual that answers "how much of the board does
 * the merged work account for" before anything is opened, and the document that carries the
 * register, the joins and their confidence.
 *
 * The visual is capped at one page and the renderer throws rather than spilling onto a second,
 * so a clean exit here is evidence of a one-page visual rather than a claim about one. The
 * document's own build() asserts the register against the board counts first, so a clean exit
 * is also evidence that the hand-transcribed register is internally consistent.
 *
 *   node scripts/artifacts/buildL04Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'L0.4');

async function main() {
  const jobs = [
    {
      name: 'L04_TRACEABILITY_1PAGE.pdf',
      html: require('./tickets/l04Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the visual: board against merged work, and where the map breaks',
    },
    {
      name: 'L04_TRACEABILITY_MATRIX.pdf',
      html: require('./tickets/l04Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
      what: 'the matrix: register, joins, confidence, proposals',
    },
  ];

  for (const j of jobs) {
    const outPath = path.join(OUT, j.name);
    const res = await renderPdf({
      html: j.html, outPath, landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    const pages = typeof res === 'number' ? res : (res && (res.pages ?? res.pageCount));
    console.log(`${j.name.padEnd(32)} ${String(pages ?? '?').padStart(2)}p  ${j.what}`);
  }
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
