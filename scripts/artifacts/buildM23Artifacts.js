/**
 * Build the M23 visual + document PDFs and the attach spec the upload step consumes.
 *
 *   node scripts/artifacts/buildM23Artifacts.js
 *   TICKET=<basecamp todo id> node scripts/artifacts/buildM23Artifacts.js
 *
 * The visual is capped at ONE page by the renderer, and that cap is enforced by reading the page
 * count back out of the rendered PDF. If the summary below says 1 page, it is because the bytes
 * were measured, not because the layout was meant to fit.
 *
 * The data module's arithmetic is checked here too, before anything is drawn: the histogram and
 * the long tail must sum to the stated total, and the listed codes plus the tail must account for
 * every distinct code. A chart whose parts do not sum to its own total is worse than no chart.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m23Data');
const { buildVisual, buildDocument } = require('./tickets/m23Render');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'artifacts', D.CODE);
const SPEC_DIR = process.env.SPEC_DIR || path.join(__dirname, '..', '..', 'docs', 'artifacts', '_specs');
/** M23 on the Design Explorer Growth / Maya ladder, list 10411539016. */
const TICKET = Number(process.env.TICKET || 10411539536);
/** Exact title, because attachArtifactToTicket.js matches on it and throws when it misses. */
const FOLDER = process.env.FOLDER || '02 - Evidence and Verification';

/** Refuse to draw a chart whose parts do not add up to the number beside it. */
function checkData() {
  const listed = D.CODES.reduce((a, c) => a + c.n, 0);
  const sum = listed + D.OTHER_CODES.n;
  if (sum !== D.SCALE.errors) {
    throw new Error(`histogram sums to ${sum} but SCALE.errors is ${D.SCALE.errors}`);
  }
  const codeCount = D.CODES.length + D.OTHER_CODES.codes;
  if (codeCount !== D.SCALE.distinctCodes) {
    throw new Error(`${codeCount} codes accounted for but SCALE.distinctCodes is ${D.SCALE.distinctCodes}`);
  }
  if (D.SCALE.filesWithErrors > D.SCALE.testFiles) {
    throw new Error('more files with errors than test files');
  }
  console.log(`data OK: ${listed} listed + ${D.OTHER_CODES.n} tail = ${sum} errors, `
    + `${codeCount} codes, ${D.SCALE.filesWithErrors} of ${D.SCALE.testFiles} files`);
}

const VISUAL_COMMENT = `<div><strong>VISUAL FIRST: ${D.CODE} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>One page, landscape, built from the same data module as the document so a number on the '
  + 'picture cannot drift from a number in the text.</div>'
  + '<div><br></div>'
  + '<div><strong>The one line worth reading:</strong> the files that do the checking were never '
  + 'checked. Three typecheck gates all read a program that excluded them, so '
  + `${D.SCALE.testFiles.toLocaleString('en-US')} test files were enforced by nothing. `
  + `${D.SCALE.errors} errors were sitting in ${D.SCALE.filesWithErrors} of them, and NONE in `
  + 'production code.</div>';

const DOC_COMMENT = `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${D.CODE}, `
  + `${D.TITLE}.</strong></div><div><br></div>`
  + `<div>The ticket asked: ${D.ASKED} Delivered: ${D.DELIVERED}</div>`
  + '<div><br></div>'
  + `<div><strong>Takeaway.</strong> ${D.TAKEAWAY}</div>`
  + '<div><br></div>'
  + '<div><strong>It also keeps what I got wrong.</strong> The checker shipped with a '
  + 'false-FAILURE mode of its own: it matched the phrase "FATAL ERROR" anywhere in tsc output, '
  + 'and those phrases appear in three ordinary src files. A completed run could have been '
  + 'declared a crash. Section 5 of the document states it rather than quietly fixing it.</div>'
  + '<div><br></div>'
  + '<div><strong>One thing for you to weigh</strong>, in section 4: the check costs '
  + `${D.COST.ciSeconds} seconds on the CI runner (an earlier draft said 13 minutes, which was the `
  + `slower development machine). It is wired REPORT-ONLY, so it is not `
  + 'blocking anything yet. Promoting it to a required status check is your call.</div>'
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
      {
        file: `/tmp/${visualName}`,
        filename: visualName,
        caption: `${D.CODE} visual, one page`,
        comment: VISUAL_COMMENT,
      },
      {
        file: `/tmp/${docName}`,
        filename: docName,
        caption: `${D.CODE} document`,
        comment: DOC_COMMENT,
      },
    ],
  };
  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const specPath = path.join(SPEC_DIR, `${D.CODE.toLowerCase()}-attach.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`spec:     ${specPath}  ticket ${TICKET}, folder "${FOLDER}"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
