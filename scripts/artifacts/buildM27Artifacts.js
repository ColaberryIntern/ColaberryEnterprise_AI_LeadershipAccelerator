/**
 * Build the M27 visual + document PDFs and the attach spec.
 *
 *   node scripts/artifacts/buildM27Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m27Data');
const { buildVisual, buildDocument } = require('./tickets/m27Render');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'artifacts', D.CODE);
const SPEC_DIR = process.env.SPEC_DIR
  || path.join(__dirname, '..', '..', 'docs', 'artifacts', '_specs');
const FOLDER = process.env.FOLDER || '03 - Maya Agent and Tools';

function checkData() {
  const states = D.STATES.map((s) => s.state);
  for (const required of ['fresh', 'aging', 'stale', 'unknown']) {
    if (!states.includes(required)) throw new Error(`state table is missing "${required}"`);
  }
  if (D.THRESHOLDS.fresh >= D.THRESHOLDS.aging) {
    throw new Error('the fresh threshold must be below the aging one');
  }
  if (D.MUTANTS.length < 4) throw new Error('fewer mutants than the document claims');
  console.log(`data OK: ${states.length} states, ${D.THRESHOLDS.fresh}h/${D.THRESHOLDS.aging}h, `
    + `${D.MUTANTS.length} mutants`);
}

const VISUAL_COMMENT = `<div><strong>VISUAL FIRST: ${D.CODE} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>One page, landscape, built from the same data module as the document.</div>'
  + '<div><br></div>'
  + `<div><strong>The one line worth reading:</strong> ${D.TAKEAWAY}</div>`;

const DOC_COMMENT = `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${D.CODE}, `
  + `${D.TITLE}.</strong></div><div><br></div>`
  + `<div>The ticket asked: ${D.ASKED} Delivered: ${D.DELIVERED}</div>`
  + '<div><br></div>'
  + `<div><strong>Takeaway.</strong> ${D.TAKEAWAY}</div>`
  + '<div><br></div>'
  + '<div><strong>It also carries a correction to my own M24 contract.</strong> That contract '
  + 'gave TWO reasons for excluding recency and only one held: it also blamed the timeline\'s '
  + '150-row cap. The cap cannot affect that field, because the timeline is ordered newest-first '
  + 'and the limit applies afterwards, so it truncates the tail. The per-caller filter is the '
  + 'whole of the defect and recency stays excluded on that alone. Section 4 of the document '
  + 'states it rather than quietly dropping it.</div>'
  + '<div><br></div>'
  + '<div><strong>Note on the earlier artifacts:</strong> the PDFs already on M24 and on M24.1 to '
  + 'M24.3 still carry the original overstatement, because the Basecamp token was unavailable '
  + 'when it was found. The repository documents are correct.</div>'
  + '<div><br></div><div>Review state unchanged. I do not close tickets.</div>';

async function main() {
  checkData();

  const visualName = `${D.SLUG}_1PAGE.pdf`;
  const docName = `${D.SLUG}.pdf`;

  const v = buildVisual();
  const vr = await renderPdf({
    html: htmlDoc({ title: v.title, css: v.css, body: v.body }),
    outPath: path.join(OUT_DIR, visualName),
    landscape: true,
    maxPages: 1,
    margin: '10mm',
  });
  console.log(`visual:   ${visualName}  ${vr.pages} page(s), ${vr.bytes} bytes, mermaid=${vr.mermaid}`);

  const d = buildDocument();
  const dr = await renderPdf({
    html: htmlDoc({ title: d.title, css: d.css, body: d.body }),
    outPath: path.join(OUT_DIR, docName),
    landscape: false,
    margin: '14mm',
  });
  console.log(`document: ${docName}  ${dr.pages} page(s), ${dr.bytes} bytes, mermaid=${dr.mermaid}`);

  const spec = {
    ticketId: D.TICKET,
    folderTitle: FOLDER,
    posts: [
      { file: `/tmp/${visualName}`, filename: visualName, caption: `${D.CODE} visual, one page`, comment: VISUAL_COMMENT },
      { file: `/tmp/${docName}`, filename: docName, caption: `${D.CODE} document`, comment: DOC_COMMENT },
    ],
  };
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const specPath = path.join(SPEC_DIR, `${D.CODE.toLowerCase()}-attach.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`spec:     ${specPath}  ticket ${D.TICKET}, folder "${FOLDER}"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
