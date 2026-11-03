/**
 * Build the artifacts for L11.5, the Colaberry Live testing strategy and evidence matrix.
 *
 * THREE OUTPUTS FROM ONE DATA MODULE: the one-page visual and the register for the Basecamp
 * folder the ticket names, and `docs/COLABERRY_LIVE_TESTING_STRATEGY.md` in the repo for
 * acceptance criterion 3 — "readable by a future Claude Code session with no chat history",
 * which a PDF in a Basecamp folder is not. Rendering all three from `l115Data` is the only
 * arrangement in which the counts in the repo and the counts in the PDF cannot drift apart.
 *
 * Unlike the other two, the Markdown IS committed: it is documentation, not a rendered artifact,
 * and `docs/artifacts/` is gitignored while `docs/` is not.
 *
 * Every exit is load-bearing. The visual is capped at one page and the renderer throws rather
 * than spilling onto a second. The self-check runs before any rendering and enforces two of the
 * acceptance criteria mechanically: a capability claim with no provenance cannot render, and an
 * empty not-covered list refuses outright.
 *
 *   node scripts/artifacts/buildL115Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L11.5');
const MD = path.join(ROOT, 'docs', 'COLABERRY_LIVE_TESTING_STRATEGY.md');

async function main() {
  const doc = require('./tickets/l115Document');

  // Before anything renders: the criteria-wired assertions.
  doc.selfCheck();
  console.log('self-check passed: every claim carries its provenance, gaps are named');

  const jobs = [
    {
      name: 'L115_TESTING_STRATEGY_1PAGE.pdf',
      html: require('./tickets/l115Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the one-pager: tiers against target, and the four defects',
    },
    {
      name: 'L115_TESTING_EVIDENCE_MATRIX.pdf',
      html: doc.build(),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
      what: 'the matrix: counts, tiers, defect history, practices, gates, gaps',
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
    + 'the in-repo document (criterion 3), committed');

  console.log('\nPDFs to ' + OUT);
  console.log('Markdown to ' + MD);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
