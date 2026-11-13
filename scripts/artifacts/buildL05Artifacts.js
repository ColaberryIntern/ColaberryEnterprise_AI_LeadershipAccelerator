/**
 * Build the artifacts for L0.5 — DOC 10, the Current Build Migration Report.
 *
 * ORDER: check the data, then write, then check the file. Section B names 40 paths and the data
 * check stats every one of them, so a renamed module fails the build before a document full of
 * dead references reaches a Basecamp ticket. The file check runs after the write because one of
 * its assertions is "the committed Markdown is what the data renders", which cannot be true
 * before the write.
 *
 * THE ONE-PAGER IS RENDERED FIRST, deliberately. It is the page Ali actually reads; if the long
 * record PDF fails to render, the useful artifact should already exist.
 *
 *   node scripts/artifacts/buildL05Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L0.5');

async function main() {
  const D = require('./tickets/l05Data');
  const doc = require('./tickets/l05Document');
  const vis = require('./tickets/l05Visual');

  // 0. Section A is a one-time measurement of the migrating tab, committed as JSON. Capturing it
  //    is explicit: a build that silently re-captured would rewrite the migration record every
  //    time anyone rebuilt, which is exactly the churn the frozen snapshot exists to prevent.
  if (process.env.CAPTURE_TAB === '1') {
    const snap = D.captureCurrentTab();
    console.log(`section A captured: branch ${snap.branch}, head ${snap.head}, `
      + `${snap.commits.length} commit(s), ${snap.uncommitted.length} uncommitted path(s)`);
  }

  // 1. The data, including every path in section B.
  const T = D.selfCheck();
  console.log(`data self-check passed: ${T.todos} todos (${T.completed} complete, ${T.open} open) `
    + `across ${T.containers} containers, ${T.tasks} parent tasks `
    + `(${T.byCoverage.COVERED} covered, ${T.byCoverage.PARTIAL} partial, `
    + `${T.byCoverage.NONE} with no ticket), ${T.boardOnly} todos outside the plan, `
    + `${T.paths} reference paths all present on disk`);

  // 2. Write the document, then check the file matches what the data renders.
  const abs = path.join(ROOT, D.META.file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const md = doc.markdown();
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (md !== before) {
    fs.writeFileSync(abs, md, 'utf8');
    console.log(`${D.META.file}: ${md.split('\n').length} lines written`);
  } else {
    console.log(`${D.META.file}: already current`);
  }
  doc.selfCheck();
  console.log(`document self-check passed: ${doc.SECTIONS.length} named sections, all 7 phases `
    + `with all 6 attributes, every one of ${T.todos} todos in exactly one of C and D`);

  vis.selfCheck();
  console.log('visual self-check passed: both divergence figures in the lede, 7 phases drawn, '
    + `all ${T.byCoverage.NONE} no-ticket tasks on the page, dark-feature callout intact`);

  // 3. The one-pager first, then the record.
  fs.mkdirSync(OUT, { recursive: true });
  const one = await renderPdf({
    html: vis.build(),
    outPath: path.join(OUT, 'L05_DOC10_MIGRATION_VISUAL.pdf'),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  console.log(`L05_DOC10_MIGRATION_VISUAL.pdf: ${one.pages} page(s)`);

  const rec = await renderPdf({
    html: doc.build(),
    outPath: path.join(OUT, 'L05_DOC10_MIGRATION_REPORT.pdf'),
    landscape: false,
    maxPages: 0,
    margin: '12mm',
  });
  console.log(`L05_DOC10_MIGRATION_REPORT.pdf: ${rec.pages} page(s)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
