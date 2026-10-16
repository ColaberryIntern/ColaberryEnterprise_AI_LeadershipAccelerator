/**
 * Build the visual + document PDFs for the six tickets worked before the artifact rule existed.
 *
 *   node scripts/artifacts/buildBackfillArtifacts.js          # all six
 *   node scripts/artifacts/buildBackfillArtifacts.js AF3.2    # just one
 *
 * Also writes the attach spec each ticket needs, so the upload step is not hand-assembled twelve
 * times. Every visual is capped at one page by the renderer: if a page count below says 1, it is
 * because the PDF was measured, not because the layout was intended to fit.
 */
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const { TICKETS, MEASURED_ON } = require('./tickets/backfillData');
const { buildVisual, buildDocument } = require('./tickets/backfillRender');

const OUT_ROOT = path.join(__dirname, '..', '..', 'docs', 'artifacts');
const SPEC_DIR = process.env.SPEC_DIR || path.join(OUT_ROOT, '_specs');

const VISUAL_COMMENT = (t) => `<div><strong>VISUAL FIRST: ${t.code} on one page.</strong> `
  + 'Backfilled under the rule that every ticket carries a visual and a document.</div>'
  + '<div><br></div>'
  + `<div>One page, landscape, built from the same data module as the document so a number on it `
  + 'cannot drift from a number in the document.</div>'
  + '<div><br></div>'
  + `<div><strong>The one line worth reading:</strong> ${t.headline}</div>`;

const DOC_COMMENT = (t) => `<div><strong>READY FOR ALI REVIEW - DOCUMENT. ${t.code}, `
  + `${t.title}.</strong></div><div><br></div>`
  + `<div>The ticket asked: ${t.asked} Delivered: ${t.delivered}</div>`
  + '<div><br></div>'
  + `<div>This is a BACKFILL. The work shipped in ${t.prLabel} and the finding was real, but the `
  + 'artifact was never filed where the ticket said it would be, which is the gap your rule '
  + 'closes. The document carries the measured figures, the diagram, and a section stating what '
  + 'the work does NOT establish.</div>'
  + (t.corrections.length
    ? '<div><br></div><div><strong>It also keeps what I got wrong first</strong>, rather than '
      + 'quietly overwriting it.</div>'
    : '')
  + '<div><br></div><div>Review state unchanged. I do not close tickets.</div>';

async function main() {
  const only = process.argv[2];
  const list = only ? TICKETS.filter((t) => t.code === only) : TICKETS;
  if (!list.length) throw new Error(`no ticket matches ${only}`);

  fs.mkdirSync(SPEC_DIR, { recursive: true });
  const summary = [];

  for (const t of list) {
    const dir = path.join(OUT_ROOT, t.code);
    const visualName = `${t.slug}_1PAGE.pdf`;
    const docName = `${t.slug}.pdf`;

    const v = await renderPdf({
      html: buildVisual(t),
      outPath: path.join(dir, visualName),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
    });
    const d = await renderPdf({
      html: buildDocument(t),
      outPath: path.join(dir, docName),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
    });

    // The attach spec. Visual first, deliberately: it is the order the rule prescribes.
    const spec = {
      ticketCode: t.code,
      ticketId: t.ticketId,
      folderTitle: t.folder,
      posts: [
        {
          file: `/tmp/backfill/${t.code}/${visualName}`,
          filename: visualName,
          caption: `${t.code} on one page, ${MEASURED_ON}`,
          comment: VISUAL_COMMENT(t),
        },
        {
          file: `/tmp/backfill/${t.code}/${docName}`,
          filename: docName,
          caption: `${t.code} ${t.title}, ${MEASURED_ON}`,
          comment: DOC_COMMENT(t),
        },
      ],
    };
    fs.writeFileSync(path.join(SPEC_DIR, `${t.code}.json`), JSON.stringify(spec, null, 2));

    summary.push({ code: t.code, visual: v.pages, doc: d.pages, mermaid: v.mermaid });
    console.log(`${t.code.padEnd(6)} visual ${v.pages}p (limit 1) `
      + `${(v.bytes / 1024).toFixed(0)}KB  |  document ${d.pages}p `
      + `${(d.bytes / 1024).toFixed(0)}KB  |  mermaid=${v.mermaid}`);
  }

  const bad = summary.filter((s) => s.visual !== 1 || s.mermaid !== 'done');
  console.log(`\n${summary.length} ticket(s), ${summary.length * 2} PDFs -> ${OUT_ROOT}`);
  console.log(`specs -> ${SPEC_DIR}`);
  if (bad.length) throw new Error(`these did not meet the contract: ${bad.map((b) => b.code)}`);
  console.log('every visual measured at exactly 1 page; mermaid rendered in all of them');
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
