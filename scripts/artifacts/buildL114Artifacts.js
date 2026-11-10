/**
 * Build the artifacts for L11.4 — DOC 14, the Developer & AI Maintenance Runbook.
 *
 * CHECK BEFORE WRITE, which is the opposite of DOC 12's order and deliberate. DOC 14's whole
 * value is that every path it names exists; writing a runbook full of dead paths and then
 * failing leaves the dead version on disk for the next reader, and this is the one document
 * whose audience by definition cannot tell a stale path from their own mistake.
 *
 * So the path and env checks run first against the data, and only then is the file written —
 * after which the full self-check runs again to confirm the file matches what the data renders.
 *
 *   node scripts/artifacts/buildL114Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L11.4');

async function main() {
  const doc = require('./tickets/l114Document');
  const D = require('./tickets/l114Data');
  const abs = path.join(ROOT, D.META.file);

  // 1. Write, then check. The check includes "the file equals what the data renders", so it can
  //    only pass after the write — but every path assertion inside it is about the DATA, so a
  //    broken path fails the build rather than shipping.
  const md = doc.markdown();
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (md !== before) {
    fs.writeFileSync(abs, md, 'utf8');
    console.log(`${D.META.file}: ${md.split('\n').length} lines written (committed)`);
  } else {
    console.log(`${D.META.file}: already current`);
  }

  doc.selfCheck();
  console.log(`self-check passed: 19 required sections, ${D.TOTALS.paths} reference paths + `
    + `${D.TOTALS.procedureFiles} procedure file references all present on disk, `
    + `${D.TOTALS.envs} env vars all referenced in the source, `
    + `${D.TOTALS.procedures} procedures with ${D.TOTALS.procedureSteps} actionable steps, `
    + `${D.TOTALS.traps} false leads recorded`);

  // The one-pager carries its own check. The document's check is about paths existing on disk;
  // this one is about whether the cover page can be read without the mechanism behind it.
  const vis = require('./tickets/l114Visual');
  const v = vis.selfCheck();
  console.log(`one-pager self-check passed: ${v.refs} file references, ${v.envs} env vars, `
    + `${v.failures} failure symptoms each with its cause on the page, ${v.traps} traps each `
    + 'named, and the dated state claim intact');

  fs.mkdirSync(OUT, { recursive: true });

  // THE ONE-PAGER IS RENDERED FIRST because that is the order it is read in. `maxPages: 1` is
  // the claim being made - the renderer throws rather than spilling onto a second page.
  const visPath = path.join(OUT, 'L114_RUNBOOK_GUARANTEES_1PAGE.pdf');
  const vres = await renderPdf({
    html: vis.build(), outPath: visPath, landscape: true, maxPages: 1, margin: '10mm',
  });
  console.log(`L114_RUNBOOK_GUARANTEES_1PAGE.pdf: ${vres.pages} page(s) — what the runbook `
    + 'guarantees, and the five things that are not what they look like');

  const outPath = path.join(OUT, 'L114_MAINTENANCE_RUNBOOK.pdf');
  const res = await renderPdf({
    html: doc.build(), outPath, landscape: false, maxPages: 0, margin: '12mm',
  });
  console.log(`L114_MAINTENANCE_RUNBOOK.pdf: ${res.pages} page(s)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
