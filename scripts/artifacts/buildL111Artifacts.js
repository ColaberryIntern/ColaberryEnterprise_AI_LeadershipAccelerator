/**
 * Build the artifacts for L11.1 — DOC 11, the System Architecture Handbook.
 *
 * THE ORDER HERE IS THE DESIGN. The register is spliced into the handbook FIRST, then the
 * self-check runs, then anything renders. That way the check is always comparing the data module
 * against a freshly written file, and a hand-edit to the register section is overwritten rather
 * than silently preserved — while a hand-edit to anything the data does not own survives
 * untouched, because the splice replaces only the marked block.
 *
 * Nothing renders if the check fails. L11.1's criterion is that every capability claim states
 * whether it is proven by test or in production, and a PDF that renders beautifully over an
 * unproven claim dressed as a tested one satisfies the opposite of that.
 *
 *   node scripts/artifacts/buildL111Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'artifacts', 'L11.1');

async function main() {
  const doc = require('./tickets/l111Document');
  const D = require('./tickets/l111Data');
  const abs = path.join(ROOT, D.META.file);

  // 1. Splice the generated register into the hand-written handbook.
  const before = fs.readFileSync(abs, 'utf8');
  const after = doc.splice(before);
  if (after !== before) {
    fs.writeFileSync(abs, after, 'utf8');
    console.log(`${D.META.file}: register section rewritten from the data module`);
  } else {
    console.log(`${D.META.file}: register already current`);
  }

  // 2. Check, against the file as it now stands.
  doc.selfCheck();
  console.log(`self-check passed: ${D.TOTALS.sections} required sections present, plain English `
    + `first, ${D.TOTALS.claims} claims each with a proof level `
    + `(${D.TOTALS.by.PRODUCTION} production, ${D.TOTALS.by.TEST} test, `
    + `${D.TOTALS.by.WIRED} wired, ${D.TOTALS.by.UNPROVEN} unproven), `
    + 'every production claim dated, every tested claim anchored to a file, every unproven claim '
    + 'naming what would settle it and naming no file');

  // 3. Render.
  const jobs = [
    {
      name: 'L111_CAPABILITY_PROOF_1PAGE.pdf',
      html: require('./tickets/l111Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the proof distribution, the four defects, the unproven list',
    },
    {
      name: 'L111_CAPABILITY_PROOF_REGISTER.pdf',
      html: doc.build(),
      landscape: true,
      maxPages: 0,
      margin: '12mm',
      what: `all ${D.TOTALS.claims} claims with proof level, anchor and evidence`,
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
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
