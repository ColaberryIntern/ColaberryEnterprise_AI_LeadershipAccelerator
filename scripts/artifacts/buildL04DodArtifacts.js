/**
 * Build the artifacts for L0.4 criterion 1 — the 48-point definition of done as DOC 09.
 *
 * THREE OUTPUTS FROM ONE DATA MODULE, the same arrangement L11.5 uses: the one-pager and the
 * matrix for the Basecamp folder the ticket names, and `docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md`
 * in the repository, because DOC 09 is one of the eighteen documents item 3 of the list requires
 * to exist and be AI-readable — and a PDF in a Basecamp folder is not that. Rendering all three
 * from `l04DodData` is the only arrangement in which the count in the repo and the count in the
 * PDF cannot drift apart.
 *
 * The Markdown IS committed: it is documentation, not a rendered artifact, and `docs/artifacts/`
 * is gitignored while `docs/` is not.
 *
 * Every exit is load-bearing. The self-check runs before anything renders and enforces the
 * criterion mechanically — all 48 covered exactly once, every DOC 09 column filled, no status
 * claimed without naming where it was found, and the no-ticket list matching the rows in both
 * directions. The one-pager is capped at one page and the renderer throws rather than spilling,
 * so a clean exit is the evidence that it is a one-pager.
 *
 *   node scripts/artifacts/buildL04DodArtifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L0.4');
const MD = path.join(ROOT, 'docs', 'COLABERRY_LIVE_TRACEABILITY_MATRIX.md');

async function main() {
  const doc = require('./tickets/l04DodDocument');
  const D = require('./tickets/l04DodData');

  doc.selfCheck();
  console.log('self-check passed: 48 covered once, every column filled, every status evidenced, '
    + `${D.NO_TICKET.length} uncovered rows declared as gaps and ${D.SEQUENCED.length} `
    + 'declared as sequenced');

  // The one-pager carries its own check. It is a different question from the document's:
  // whether the page's tiles agree with the lists printed under them.
  const vis = require('./tickets/l04DodVisual');
  const v = vis.selfCheck();
  console.log(`one-pager self-check passed: ${v.noTicket} with no ticket = ${v.gaps} gaps + `
    + `${v.sequenced} sequenced, each named on the page; ${v.blockers} launch blockers`);

  const jobs = [
    {
      name: 'L04_DEFINITION_OF_DONE_1PAGE.pdf',
      html: vis.build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the count, the bands, the gaps and the blockers',
    },
    {
      name: 'L04_DEFINITION_OF_DONE_MATRIX.pdf',
      html: doc.build(),
      landscape: true,
      maxPages: 0,
      margin: '12mm',
      what: 'DOC 09: all 48 conditions, nine columns',
    },
  ];

  for (const j of jobs) {
    const outPath = path.join(OUT, j.name);
    const res = await renderPdf({
      html: j.html, outPath, landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    const pages = typeof res === 'number' ? res : (res && (res.pages ?? res.pageCount));
    console.log(`${j.name.padEnd(36)} ${String(pages ?? '?').padStart(2)}p  ${j.what}`);
  }

  const md = doc.markdown();
  fs.writeFileSync(MD, md, 'utf8');
  console.log(`${path.basename(MD).padEnd(36)} ${String(md.split('\n').length).padStart(2)}L  `
    + 'DOC 09 in the repo, committed');

  console.log(`\n${D.TOTALS.satisfied} of 48 satisfied · ${D.TOTALS.by.PARTIAL} partial · `
    + `${D.TOTALS.by.NOT} not met · ${D.TOTALS.by.BLOCKED} not assessable · `
    + `${D.TOTALS.blockers} launch blockers · ${D.TOTALS.noTicket} with no ticket`);
  console.log('PDFs to ' + OUT);
  console.log('Markdown to ' + MD);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
