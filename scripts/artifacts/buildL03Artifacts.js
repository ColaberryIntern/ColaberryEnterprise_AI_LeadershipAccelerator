/**
 * Build the artifacts for L0.3, the Colaberry Live launch-risk review.
 *
 * TWO PDFs from ONE data module: the one-pager that says what is actually blocking the board
 * before anything is opened, and the register that carries the evidence behind every claim
 * that a ticket already holds finished work.
 *
 * Both exits are load-bearing. The visual is capped at one page and the renderer throws rather
 * than spilling onto a second, so a clean run is evidence of acceptance criterion 4 rather
 * than a promise about it. The document's build() runs its self-check first — including the
 * assertion that nothing may be classified as already built without naming the module and
 * commit it was found at — so a clean run is also evidence the register is internally
 * consistent with the board's own per-group counts.
 *
 *   node scripts/artifacts/buildL03Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'L0.3');

async function main() {
  const jobs = [
    {
      name: 'L03_LAUNCH_RISK_1PAGE.pdf',
      html: require('./tickets/l03Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the one-pager: what blocks each ticket, and the cut list',
    },
    {
      name: 'L03_LAUNCH_RISK_REGISTER.pdf',
      html: require('./tickets/l03Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
      what: 'the register: 39 tickets, evidence, cuts, what not to cut',
    },
  ];

  for (const j of jobs) {
    const outPath = path.join(OUT, j.name);
    const res = await renderPdf({
      html: j.html, outPath, landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    const pages = typeof res === 'number' ? res : (res && (res.pages ?? res.pageCount));
    console.log(`${j.name.padEnd(34)} ${String(pages ?? '?').padStart(2)}p  ${j.what}`);
  }
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
