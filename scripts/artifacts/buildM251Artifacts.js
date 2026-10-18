/**
 * Build the M25.1 visual + document PDFs and the attach spec.
 *
 *   node scripts/artifacts/buildM251Artifacts.js
 *
 * The before/after shares are checked against each other before anything is drawn: a chart whose
 * "after" column contradicts its own table is how a confident wrong number ships.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m251Data');
const { buildVisual, buildDocument } = require('./tickets/m251Render');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'M25_1');
const SPEC_DIR = process.env.SPEC_DIR
  || path.join(__dirname, '..', '..', 'docs', 'artifacts', '_specs');
const FOLDER = process.env.FOLDER || '03 - Maya Agent and Tools';

function checkData() {
  const after = D.SHARES.reduce((a, s) => a + s.after, 0);
  if (Math.abs(after - 100) > 1.5) {
    throw new Error(`the "after" shares sum to ${after.toFixed(1)}%, not ~100%`);
  }
  const before = D.SHARES.filter((s) => s.before !== null).reduce((a, s) => a + (s.before ?? 0), 0);
  if (Math.abs(before - 100) > 1.5) {
    throw new Error(`the "before" shares sum to ${before.toFixed(1)}%, not ~100%`);
  }
  const recency = D.SHARES.find((s) => s.key === 'recency');
  if (recency?.before !== null) throw new Error('recency cannot have a "before" share: it did not exist');
  if (D.DEAD.afterTotal <= D.DEAD.beforeTotal) {
    throw new Error('adding a factor must raise the ruleset total');
  }
  console.log(`data OK: before ${before.toFixed(1)}%, after ${after.toFixed(1)}%, `
    + `dead ${D.DEAD.beforePoints}/${D.DEAD.beforeTotal} to ${D.DEAD.afterPoints}/${D.DEAD.afterTotal}`);
}

const VISUAL_COMMENT = `<div><strong>VISUAL FIRST: ${D.CODE} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>A before and after of who carries the ordering, because that one comparison is the '
  + 'whole argument. Built from the same data module as the document.</div>'
  + '<div><br></div>'
  + `<div><strong>The one line worth reading:</strong> ${D.TAKEAWAY}</div>`;

const DOC_COMMENT = `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${D.CODE}, `
  + `${D.TITLE}.</strong></div><div><br></div>`
  + `<div>The ticket asked: ${D.ASKED} Delivered: ${D.DELIVERED}</div>`
  + '<div><br></div>'
  + `<div><strong>Takeaway.</strong> ${D.TAKEAWAY}</div>`
  + '<div><br></div>'
  + '<div><strong>This answers the weights question you approved, and the answer was not new '
  + 'weights.</strong> Measuring showed the ordering was carried by a factor most people lack, so '
  + 'reweighting would have redistributed points across evidence that is not there. What was '
  + 'missing was signal. Section 3 explains how recency was unblocked without widening anybody\'s '
  + 'permissions.</div>'
  + '<div><br></div>'
  + '<div><strong>It also records a merge that lied.</strong> PR #3196 read MERGED while the '
  + 'recency commit never reached main, because GitHub never advanced that PR\'s head. Caught by '
  + 'checking main\'s content rather than the badge, and recovered in PR #3204. Section 5.</div>'
  + '<div><br></div>'
  + '<div><strong>Still yours:</strong> what the factors should be WORTH. The measurement says '
  + 'which ones can rank; it does not say what readiness means.</div>'
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
  console.log(`visual:   ${visualName}  ${vr.pages} page(s), ${vr.bytes} bytes`);

  const d = buildDocument();
  const dr = await renderPdf({
    html: htmlDoc({ title: d.title, css: d.css, body: d.body }),
    outPath: path.join(OUT_DIR, docName),
    landscape: false,
    margin: '14mm',
  });
  console.log(`document: ${docName}  ${dr.pages} page(s), ${dr.bytes} bytes`);

  const spec = {
    ticketId: D.TICKET,
    folderTitle: FOLDER,
    posts: [
      { file: `/tmp/${visualName}`, filename: visualName, caption: `${D.CODE} visual, one page`, comment: VISUAL_COMMENT },
      { file: `/tmp/${docName}`, filename: docName, caption: `${D.CODE} document`, comment: DOC_COMMENT },
    ],
  };
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const specPath = path.join(SPEC_DIR, 'm25-1-artifact-attach.json');
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`spec:     ${specPath}  ticket ${D.TICKET}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
