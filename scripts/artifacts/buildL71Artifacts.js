/**
 * Build the artifacts for L7.1 and the L9.6 finding.
 *
 * THREE PDFs from ONE data module: a one-page visual per ticket, and one document that serves
 * both because they are one packet of work. The renderer throws rather than writing a second page
 * on a capped job, so a clean exit here is evidence of a one-page visual rather than a claim
 * about one.
 *
 *   node scripts/artifacts/buildL71Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'L7.1');

async function main() {
  const jobs = [
    {
      name: 'L71_CORPUS_COVERAGE_1PAGE.pdf',
      html: require('./tickets/l71Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'L7.1 visual: what the corpus covers, and at which layer',
    },
    {
      name: 'L96_SOURCE_OVERFLOW_1PAGE.pdf',
      html: require('./tickets/l96Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'L9.6 visual: why the completeness check cannot see the overflow',
    },
    {
      name: 'L71_REFERENCE_CORPUS.pdf',
      html: require('./tickets/l71Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
      what: 'the document, serving both tickets',
    },
  ];

  for (const j of jobs) {
    const outPath = path.join(OUT, j.name);
    // `renderPdf` returns a RESULT OBJECT, not a page count. The first version of this line
    // logged `[object Object]p`, which is the kind of output that looks like a number at a glance.
    const res = await renderPdf({
      html: j.html, outPath, landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    const pages = typeof res === 'number' ? res : (res && (res.pages ?? res.pageCount));
    console.log(`${j.name.padEnd(34)} ${String(pages ?? '?').padStart(2)}p  ${j.what}`);
  }
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
