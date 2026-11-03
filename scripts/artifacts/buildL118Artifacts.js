/**
 * Build the artifacts for L11.8 — the nine remaining Colaberry Live project documents.
 *
 * THE SELF-CHECK RUNS FIRST AND NOTHING RENDERS IF IT FAILS. That ordering is the point: the
 * ticket's criterion is a count of documents and a promise that unbuilt things are named rather
 * than omitted, and a PDF that renders beautifully over a missing document satisfies neither.
 * The check reads all nine files off the disk and looks for every requirement transcribed from
 * bootstrap §3.1, §10, §11, §12, §15 and §17 — requirement toward file, never the reverse.
 *
 * Three outputs, one data module, same arrangement as L0.4 and L11.5: the one-pager and the
 * ledger go to the Basecamp folder, and `docs/colaberry-live/README.md` is committed, because an
 * index that only exists as a PDF cannot be read by the next Claude Code session — which is the
 * whole reason bootstrap §3 asks for these documents in the first place.
 *
 *   node scripts/artifacts/buildL118Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L11.8');
const MD = path.join(ROOT, 'docs', 'colaberry-live', 'README.md');

async function main() {
  const doc = require('./tickets/l118Document');
  const D = require('./tickets/l118Data');

  doc.selfCheck();
  console.log(`self-check passed: ${D.TOTALS.required} documents ledgered, `
    + `${D.TOTALS.written} on disk, ${D.TOTALS.requirements} bootstrap requirements found `
    + `across the ${D.TOTALS.thisPass} written here, every gap section present, `
    + `${D.TOTALS.noTicket} untracked document declared`);

  const jobs = [
    {
      name: 'L118_PROJECT_DOCUMENTS_1PAGE.pdf',
      html: require('./tickets/l118Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the count, the contract sizes, what is left and the untracked document',
    },
    {
      name: 'L118_PROJECT_DOCUMENTS_LEDGER.pdf',
      html: doc.build(),
      landscape: true,
      maxPages: 0,
      margin: '12mm',
      what: 'all eighteen required documents plus the coverage contract for the nine',
    },
  ];

  fs.mkdirSync(OUT, { recursive: true });
  for (const j of jobs) {
    const outPath = path.join(OUT, j.name);
    const res = await renderPdf({
      html: j.html, outPath, landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log(`${j.name}: ${res.pages} page(s) — ${j.what}`);
  }

  const md = doc.markdown();
  fs.writeFileSync(MD, md, 'utf8');
  console.log(`docs/colaberry-live/README.md: ${md.split('\n').length} lines (committed)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
