/**
 * Emit the attach specs for the eight ungrouped Agent Factory closeout tickets.
 *
 *   node scripts/artifacts/buildAf14CloseoutSpecs.js
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
const D = require('./tickets/af14CloseoutData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF14-CLOSEOUT-2026-11-28', 'specs');
/** Where the PDFs will sit ON THE PRODUCTION BOX when the attacher runs. */
const REMOTE = '/tmp/af14closeout';
const FOLDER = '08 - Rollout, Evidence and Kickoff';

const ascii = (s) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/·/g, '-')
  .replace(/[^\x00-\x7F]/g, '');

const stateLine = () => D.STATE.map(([l, n]) => `${l}: ${n}`).join('. ');

/**
 * Only the first letter is lowered, never the whole label, or "the 27 Nov pass" becomes
 * "the 27 nov pass". Segments are joined with a semicolon rather than a comma because several
 * of the labels contain commas of their own, and a comma-joined run reads as twice as many
 * items as it has.
 */
const lede = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const covLine = () => D.COVERAGE.map(([l, n]) => `${n} ${lede(l)}`).join('; ');
const newLine = () => D.NEW_TICKETS.map(([c, id, title]) =>
  `${c} (${title.split(',')[0]}) https://app.basecamp.com/3945211/buckets/${D.BUCKET}/todos/${id}`).join('\n');

function comment(t) {
  return ascii([
    `ASKED AND DELIVERED. ${t.asked} ${t.delivered}`,
    '',
    'TAKEAWAY. This ticket is finished and is being closed. It is one of eight closed together on '
    + '28 Nov 2026 after an audit of the 27 ungrouped todos on this list, which an earlier pass '
    + 'had never read. Six of the eight were already fixed before the audit looked, and one was '
    + 'fixed within hours of its own ticket being written. So the honest reading of this set is '
    + 'not that eight problems were solved this week. It is that the list lagged the system, and '
    + 'builders were told things about their own work that had stopped being true.',
    '',
    `THIS AUDIT'S OWN COVERAGE. ${covLine()}. The 27 Nov pass read the eleven groups and nothing `
    + 'else, and reported 25 open tickets when the real figure was 39, because a todo sitting '
    + 'directly on a list is not returned by any of that list\'s groups. Stated before the '
    + 'verdicts rather than after them.',
    '',
    `WHAT A BUILDER IS ACTUALLY WAITING ON, measured in accelerator_prod on ${D.MEASURED_ON}. `
    + `${stateLine()}. Closing eight tickets moves none of those.`,
    '',
    `WHAT THIS DOES NOT ESTABLISH. ${t.notEstablished.join(' ')}`,
    '',
    'FOUND ON THE WAY, filed today:',
    newLine(),
    '',
    'Two PDFs are attached: the one-page visual first, then the completion document.',
  ].join('\n'));
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const key of Object.keys(D.TICKETS)) {
    const t = D.TICKETS[key];
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
    const p = path.join(OUT, `${t.slug}-attach.json`);
    fs.writeFileSync(p, JSON.stringify(spec, null, 2));
    console.log(`${t.code.padEnd(10)} -> ${path.basename(p)}`);
  }
  console.log(`\nwritten to ${OUT}`);
}

main();
