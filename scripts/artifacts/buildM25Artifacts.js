/**
 * Build the M25 visual + document PDFs and the attach spec.
 *
 *   node scripts/artifacts/buildM25Artifacts.js
 *
 * The histogram's buckets must sum to the population the report said it scored. That check is
 * the whole reason the figures live in a data module instead of being typed into the prose: a
 * chart whose bars do not add up to its own caption is how a confident wrong number ships.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf, htmlDoc } = require('./renderArtifactPdf');
const D = require('./tickets/m25Data');
const { buildVisual, buildDocument } = require('./tickets/m25Render');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'artifacts', D.CODE);
const SPEC_DIR = process.env.SPEC_DIR
  || path.join(__dirname, '..', '..', 'docs', 'artifacts', '_specs');
const FOLDER = process.env.FOLDER || '03 - Maya Agent and Tools';

function checkData() {
  const binned = D.HISTOGRAM.reduce((s, [, n]) => s + n, 0);
  if (binned !== D.RUN.population) {
    throw new Error(`histogram sums to ${binned} but the run scored ${D.RUN.population}`);
  }
  const dead = D.FACTORS
    .filter((f) => D.DEAD_WEIGHT.factors.includes(f.key))
    .reduce((s, f) => s + f.max, 0);
  if (dead !== D.DEAD_WEIGHT.points) {
    throw new Error(`the named dead factors total ${dead}, not ${D.DEAD_WEIGHT.points}`);
  }
  const iqr = Math.round((D.RUN.p75 - D.RUN.p25) * 100) / 100;
  if (iqr !== D.DEAD_WEIGHT.iqrPoints) {
    throw new Error(`p75-p25 is ${iqr}, not the stated ${D.DEAD_WEIGHT.iqrPoints}`);
  }
  if (!(D.RUN.min <= D.RUN.median && D.RUN.median <= D.RUN.max)) {
    throw new Error('the quantiles are not ordered');
  }
  console.log(`data OK: ${binned} binned = ${D.RUN.population} scored, `
    + `${D.DEAD_WEIGHT.points}/${D.DEAD_WEIGHT.of} dead points, IQR ${iqr}`);
}

const VISUAL_COMMENT = `<div><strong>VISUAL FIRST: ${D.CODE} on one page.</strong></div>`
  + '<div><br></div>'
  + '<div>One page, landscape, built from the same data module as the document. Every figure is '
  + "copied from the read-only report's own output.</div>"
  + '<div><br></div>'
  + `<div><strong>The one line worth reading:</strong> ${D.TAKEAWAY}</div>`;

const DOC_COMMENT = `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${D.CODE}, `
  + `${D.TITLE}.</strong></div><div><br></div>`
  + `<div>The ticket asked: ${D.ASKED} Delivered: ${D.DELIVERED}</div>`
  + '<div><br></div>'
  + `<div><strong>Takeaway.</strong> ${D.TAKEAWAY}</div>`
  + '<div><br></div>'
  + `<div><strong>THE DECISION IS YOURS AND I AM RECOMMENDING AGAINST THE DEFAULT.</strong> `
  + `${D.DECISION}</div>`
  + '<div><br></div>'
  + `<div><strong>Nothing was written and nothing surfaced.</strong> The run scored `
  + `${D.RUN.population} people read-only in ${D.RUN.seconds} seconds; no score is persisted, no `
  + 'queue is ordered, nothing was sent.</div>'
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
  const specPath = path.join(SPEC_DIR, `${D.CODE.toLowerCase()}-attach.json`);
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`spec:     ${specPath}  ticket ${D.TICKET}, folder "${FOLDER}"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
