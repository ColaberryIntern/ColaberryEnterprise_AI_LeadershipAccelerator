/**
 * Build the visual + document PDFs and attach spec for ONE of the three M24 fix tickets.
 *
 *   node scripts/artifacts/buildM24FixArtifacts.js M24.1
 *   node scripts/artifacts/buildM24FixArtifacts.js            # all three
 *
 * Ali's rule is one visual and one document per TICKET, not one bundle across three: a linked
 * bundle shows him nothing when he opens a single ticket.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m24FixesData');
const { buildVisual, buildDocument } = require('./tickets/m24FixesRender');

const OUT_ROOT = path.join(__dirname, '..', '..', 'docs', 'artifacts');
const SPEC_DIR = process.env.SPEC_DIR || path.join(OUT_ROOT, '_specs');
const FOLDER = process.env.FOLDER || '02 - Evidence and Verification';

function checkData() {
  const { inputs, safeBefore, safeAfter, excludedAfter } = D.CONTRACT;
  if (safeAfter + excludedAfter !== inputs) {
    throw new Error(`${safeAfter} + ${excludedAfter} does not account for ${inputs} inputs`);
  }
  if (safeAfter <= safeBefore) throw new Error('the fixes are claimed to have changed nothing');
  if (D.STILL_EXCLUDED.length !== excludedAfter) {
    throw new Error(`${D.STILL_EXCLUDED.length} excluded entries but the tally says ${excludedAfter}`);
  }
  if (D.FIXES.length !== 3) throw new Error(`expected 3 fixes, found ${D.FIXES.length}`);
  console.log(`data OK: ${safeBefore} -> ${safeAfter} safe of ${inputs}, `
    + `${excludedAfter} still excluded, ${D.FIXES.length} fixes`);
}

const VISUAL_COMMENT = (f) => `<div><strong>VISUAL FIRST: ${f.code} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>One page, landscape, built from the same data module as the document.</div>'
  + '<div><br></div>'
  + `<div><strong>Was:</strong> ${f.was}</div>`
  + '<div><br></div>'
  + `<div><strong>Now:</strong> ${f.now}</div>`;

const DOC_COMMENT = (f) => `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${f.code}, `
  + `${f.title}.</strong></div><div><br></div>`
  + `<div>The ticket asked for this fix. Delivered, with the test that proves it: the mutant "`
  + `${f.mutant}" kills "${f.killed}", and the restore was proved byte-identical with cmp.</div>`
  + '<div><br></div>'
  + `<div><strong>The rule all three serve.</strong> ${D.RULE} ${D.WHY}</div>`
  + '<div><br></div>'
  + `<div><strong>Together the three fixes moved the M24 contract from ${D.CONTRACT.safeBefore} `
  + `of ${D.CONTRACT.inputs} inputs safe to ${D.CONTRACT.safeAfter} of ${D.CONTRACT.inputs}.</strong> `
  + `Two remain excluded and are named in section 6 rather than folded into the yes.</div>`
  + '<div><br></div>'
  + `<div>${D.M22}</div>`
  + '<div><br></div><div>Review state unchanged. I do not close tickets.</div>';

async function one(f) {
  const dir = path.join(OUT_ROOT, f.code.replace('.', '_'));
  const visualName = `${f.slug}_1PAGE.pdf`;
  const docName = `${f.slug}.pdf`;

  const v = buildVisual(f.code);
  const vr = await renderPdf({
    html: htmlDoc({ title: v.title, css: v.css, body: v.body }),
    outPath: path.join(dir, visualName),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  console.log(`  visual:   ${visualName}  ${vr.pages} page(s), ${vr.bytes} bytes, mermaid=${vr.mermaid}`);

  const d = buildDocument(f.code);
  const dr = await renderPdf({
    html: htmlDoc({ title: d.title, css: d.css, body: d.body }),
    outPath: path.join(dir, docName),
    landscape: false,
    margin: '14mm',
  });
  console.log(`  document: ${docName}  ${dr.pages} page(s), ${dr.bytes} bytes, mermaid=${dr.mermaid}`);

  const spec = {
    ticketId: f.ticket,
    folderTitle: FOLDER,
    posts: [
      { file: `/tmp/${visualName}`, filename: visualName, caption: `${f.code} visual, one page`, comment: VISUAL_COMMENT(f) },
      { file: `/tmp/${docName}`, filename: docName, caption: `${f.code} document`, comment: DOC_COMMENT(f) },
    ],
  };
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const specPath = path.join(SPEC_DIR, `${f.code.toLowerCase().replace('.', '-')}-attach.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`  spec:     ${path.basename(specPath)}  ticket ${f.ticket}`);
}

async function main() {
  checkData();
  const only = process.argv[2];
  const list = only ? [D.byCode(only)] : D.FIXES;
  for (const f of list) {
    console.log(`\n${f.code}:`);
    await one(f);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
