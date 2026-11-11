/**
 * Build the artifacts for L11.2 — DOC 12, the ten architecture diagrams.
 *
 * THE DOCUMENT IS WRITTEN FIRST, THEN CHECKED, THEN RENDERED. DOC 12 is fully generated, so the
 * check's job is to verify the data module against the bootstrap's contract and then confirm the
 * file on disk is exactly what the data renders — which it can only do after the write.
 *
 * THE PDF IS THE REAL PROOF THAT THESE DIAGRAMS EXIST. `renderPdf` refuses to emit when any
 * `.mermaid` block produced no `<svg>`, so a clean exit means ten diagrams actually rendered
 * rather than ten blocks of literal source text in a document that still looks finished. That
 * guard needs network for the Mermaid CDN; if it is unavailable this build fails loudly, which
 * is the correct outcome.
 *
 *   node scripts/artifacts/buildL112Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L11.2');

async function main() {
  const doc = require('./tickets/l112Document');
  const D = require('./tickets/l112Data');
  const abs = path.join(ROOT, D.META.file);

  // 1. Write the generated document.
  const md = doc.markdown();
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (md !== before) {
    fs.writeFileSync(abs, md, 'utf8');
    console.log(`${D.META.file}: ${md.split('\n').length} lines written (committed)`);
  } else {
    console.log(`${D.META.file}: already current`);
  }

  // 2. Check, against the file as it now stands.
  doc.selfCheck();
  console.log(`self-check passed: ${D.TOTALS.diagrams} diagrams, `
    + `${D.TOTALS.required} required elements all present in the Mermaid source, `
    + `every diagram carrying its "what you should learn" caption, and all `
    + `${D.TOTALS.notBuiltNodes} unbuilt nodes styled as unbuilt in both directions`);

  // 3. The one-pager carries its own check: the document's check is about the Mermaid source,
  //    this one is about whether the page can be misread as "ten diagrams, done".
  const vis = require('./tickets/l112Visual');
  const v = vis.selfCheck();
  console.log(`one-pager self-check passed: ${v.withNotBuilt} of ${v.diagrams} diagrams carry `
    + `${v.nodes} unbuilt nodes, every diagram named on the page, the styling rule stated, `
    + `and the ${v.needed} the Operator Manual needs each listed`);

  // 4. Render. A clean exit here is the evidence the diagrams rendered.
  //
  //    THE ONE-PAGER IS RENDERED FIRST because that is the order it is read in: one page to
  //    decide whether the ticket is discharged, then the diagrams behind it. `maxPages: 1` is
  //    the claim being made - the renderer throws rather than spilling onto a second page.
  fs.mkdirSync(OUT, { recursive: true });
  const visPath = path.join(OUT, 'L112_DIAGRAM_COVERAGE_1PAGE.pdf');
  const vres = await renderPdf({
    html: vis.build(), outPath: visPath, landscape: true, maxPages: 1, margin: '10mm',
  });
  console.log(`L112_DIAGRAM_COVERAGE_1PAGE.pdf: ${vres.pages} page(s) — what the ten diagrams `
    + 'say about the system, and how much of it does not exist');

  const outPath = path.join(OUT, 'L112_ARCHITECTURE_DIAGRAMS.pdf');
  const res = await renderPdf({
    html: doc.build(), outPath, landscape: false, maxPages: 0, margin: '12mm',
  });
  console.log(`L112_ARCHITECTURE_DIAGRAMS.pdf: ${res.pages} page(s), mermaid=${res.mermaid} — `
    + `all ${D.TOTALS.diagrams} diagrams rendered to SVG`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
