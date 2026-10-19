/**
 * Build the M24 visual + document PDFs and the attach spec.
 *
 *   node scripts/artifacts/buildM24Artifacts.js
 *
 * The visual is capped at ONE page by the renderer, and that cap is enforced by reading the page
 * count back out of the rendered bytes rather than trusting the layout.
 *
 * The arithmetic is checked BEFORE anything is drawn, and it is not ceremony: the contract this
 * artifact summarizes shipped a first draft whose headline said eight safe inputs while its table
 * held seven. A chart whose parts do not sum to the number beside it is worse than no chart.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m24Data');
const { buildVisual, buildDocument } = require('./tickets/m24Render');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'artifacts', D.CODE);
const SPEC_DIR = process.env.SPEC_DIR
  || path.join(__dirname, '..', '..', 'docs', 'artifacts', '_specs');

/** M24 on the Design Explorer Growth / Maya ladder, list 10411539016. */
const TICKET = Number(process.env.TICKET || 10411539554);
/** Exact title: attachArtifactToTicket.js matches on it and throws when it misses. */
const FOLDER = process.env.FOLDER || '01 - Contracts and Specs';

function checkData() {
  const safe = D.INPUTS.filter((i) => i.verdict === 'SAFE').length;
  const excluded = D.INPUTS.filter((i) => i.verdict === 'EXCLUDED').length;
  if (safe !== D.COUNTS.safe) throw new Error(`COUNTS.safe says ${D.COUNTS.safe}, rows say ${safe}`);
  if (excluded !== D.COUNTS.excluded) {
    throw new Error(`COUNTS.excluded says ${D.COUNTS.excluded}, rows say ${excluded}`);
  }
  if (safe + excluded !== D.INPUTS.length) {
    throw new Error(`${safe} + ${excluded} does not account for ${D.INPUTS.length} inputs`);
  }
  if (D.COUNTS.inputs !== D.INPUTS.length) {
    throw new Error(`COUNTS.inputs says ${D.COUNTS.inputs}, rows say ${D.INPUTS.length}`);
  }
  const verdicts = new Set(D.INPUTS.map((i) => i.verdict));
  for (const v of verdicts) {
    if (v !== 'SAFE' && v !== 'EXCLUDED') throw new Error(`unreviewed verdict: ${v}`);
  }
  console.log(`data OK: ${safe} safe + ${excluded} excluded = ${D.INPUTS.length} inputs, `
    + `${D.COUNTS.evidenceGroups} evidence groups, ${D.TO_YES.length} items to yes`);
}

const VISUAL_COMMENT = `<div><strong>VISUAL FIRST: ${D.CODE} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>One page, landscape, built from the same data module as the document so a number on '
  + 'the picture cannot drift from a number in the text.</div>'
  + '<div><br></div>'
  + `<div><strong>The answer: ${D.VERDICT}</strong> ${D.COUNTS.safe} of the `
  + `${D.COUNTS.inputs} inputs the score needs are safe. The whole passive-browsing component is `
  + 'not: both inputs that would feed it report 0 for a person we have no evidence about.</div>';

const DOC_COMMENT = `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${D.CODE}, `
  + 'SRS input contract.</strong></div><div><br></div>'
  + `<div>The ticket asked: ${D.ASKED} Delivered: ${D.DELIVERED}</div>`
  + '<div><br></div>'
  + `<div><strong>Takeaway.</strong> ${D.TAKEAWAY}</div>`
  + '<div><br></div>'
  + '<div><strong>One decision is yours</strong>, and it is item 4: M22, the 37 ambiguous rows. '
  + 'Until they are resolved or explicitly parked, who gets scored is a default rather than a '
  + 'decision. The other three items are small local code fixes, proposed rather than done, '
  + 'because this is a document ticket.</div>'
  + '<div><br></div>'
  + '<div><strong>It also keeps what I got wrong.</strong> The first draft of Part 7 said "eight '
  + `of the thirteen inputs are safe" while its own table held ${D.COUNTS.safe}. Nothing caught `
  + 'it, so the binding test now compares the headline to a tally of the table. Section 3 of the '
  + 'document states it rather than quietly fixing it.</div>'
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
  console.log(`visual:   ${vr.outPath}  ${vr.pages} page(s), ${vr.bytes} bytes, mermaid=${vr.mermaid}`);

  const d = buildDocument();
  const dr = await renderPdf({
    html: htmlDoc({ title: d.title, css: d.css, body: d.body }),
    outPath: path.join(OUT_DIR, docName),
    landscape: false,
    margin: '14mm',
  });
  console.log(`document: ${dr.outPath}  ${dr.pages} page(s), ${dr.bytes} bytes, mermaid=${dr.mermaid}`);

  // The visual is listed FIRST so it previews above the document on the ticket.
  const spec = {
    ticketId: TICKET,
    folderTitle: FOLDER,
    posts: [
      { file: `/tmp/${visualName}`, filename: visualName, caption: `${D.CODE} visual, one page`, comment: VISUAL_COMMENT },
      { file: `/tmp/${docName}`, filename: docName, caption: `${D.CODE} document`, comment: DOC_COMMENT },
    ],
  };
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const specPath = path.join(SPEC_DIR, `${D.CODE.toLowerCase()}-attach.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`spec:     ${specPath}  ticket ${TICKET}, folder "${FOLDER}"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
