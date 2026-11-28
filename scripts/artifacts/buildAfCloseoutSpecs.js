/**
 * Emit the attach specs for the five Agent Factory closeout tickets.
 *
 *   node scripts/artifacts/buildAfCloseoutSpecs.js
 *
 * One JSON per ticket, in the shape `attachArtifactToTicket.js` expects:
 *   { ticketId, folderTitle, posts: [{ file, filename, caption, comment }] }
 *
 * Generated rather than hand-written so the headline on the Basecamp comment and the headline on
 * the PDF beside it are the same string. Content is ASCII only: this route has mangled UTF-8
 * before, so no curly quotes, no middots, no dashes that are not hyphens.
 */
const fs = require('fs');
const path = require('path');
const { TICKETS, PIPELINE, REQUESTS } = require('./tickets/afCloseoutData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF-CLOSEOUT-2026-11-27', 'specs');
/** Where the PDFs will sit ON THE PRODUCTION BOX when the attacher runs. */
const REMOTE = '/tmp/afcloseout';
const FOLDER = '11 - Tool Requests, Review and Grants';

const ascii = (s) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/·/g, '-').replace(/[^\x00-\x7F]/g, '');

const counts = () => PIPELINE.map(([l, n]) => `${l}: ${n}`).join('. ');
const overdue = REQUESTS.filter((r) => r[4]).map((r) => `${r[0]} (${r[1]})`).join(', ');

function comment(t) {
  return ascii([
    `ASKED AND DELIVERED. ${t.asked} ${t.delivered}`,
    '',
    `TAKEAWAY. This ticket is finished and is being closed. It is one of five closed together `
    + `on 27 Nov 2026 after an audit of the whole list, and the set shares one caveat none of them `
    + `states alone: each built a working piece of the tool-request pipeline, and no real request `
    + `has ever traveled it.`,
    '',
    `MEASURED IN PRODUCTION, 27 Nov 2026. ${counts()}.`,
    '',
    `FIVE REQUESTS ARE WAITING ON A DECISION, filed by real builders: three for executive `
    + `(18 Nov), one for platform (23 Nov), one for admissions (25 Nov). ${overdue} is past its `
    + `needed-by date.`,
    '',
    `WHAT THIS DOES NOT ESTABLISH. ${t.notEstablished.join(' ')}`,
    '',
    `NEXT, AND IT IS NOT A BUILD. AF6.3 decides how a capability leaves draft and who may confirm `
    + `it, then AF7.1 confirms one domain so the confirmed count stops being zero. Until AF6.3 is `
    + `decided, every tool grant stays refused as capability_not_confirmed.`,
    '',
    'Two PDFs are attached: the one-page visual first, then the completion document.',
  ].join('\n'));
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const key of Object.keys(TICKETS)) {
    const t = TICKETS[key];
    const spec = {
      ticketId: t.id,
      folderTitle: FOLDER,
      posts: [
        {
          file: `${REMOTE}/${t.slug}_1PAGE.pdf`,
          filename: `${t.slug}_1PAGE.pdf`,
          caption: ascii(`${t.code} one-page visual: ${t.headline}`),
          comment: comment(t),
        },
        {
          file: `${REMOTE}/${t.slug}_COMPLETION.pdf`,
          filename: `${t.slug}_COMPLETION.pdf`,
          caption: ascii(`${t.code} completion document`),
          comment: '',
        },
      ],
    };
    const p = path.join(OUT, `${t.code.replace(/\./g, '')}-attach.json`);
    fs.writeFileSync(p, JSON.stringify(spec, null, 2));
    console.log(`${t.code.padEnd(8)} -> ${path.basename(p)}`);
  }
  console.log(`\nwritten to ${OUT}`);
}

main();
