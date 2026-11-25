/**
 * Build the Revenue Room ladder's ticket artifacts: a one-page visual and a document per ticket.
 *
 *   node scripts/artifacts/buildRevenueRoomArtifacts.js            # all three
 *   node scripts/artifacts/buildRevenueRoomArtifacts.js r26        # one
 *
 * Output: docs/artifacts/REVENUE-ROOM (gitignored - the repo is public and artifacts never
 * land in it).
 *
 * Backfill, not a new requirement: R25 and R26 were closed on a PR and a session record, under
 * a code-ticket exception that was superseded on 21 Nov 2026. Ali restated the rule on 25 Nov.
 * A ticket already closed without its artifacts gets them backfilled.
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/revenueRoomRender');
const D = require('./tickets/revenueRoomData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'REVENUE-ROOM');

async function buildOne(key) {
  const t = D.TICKETS[key];
  const up = t.key.toUpperCase();

  const v = await renderPdf({
    html: R.buildVisual(key),
    outPath: path.join(OUT, `${up}_DECISION_1PAGE.pdf`),
    landscape: true,
    maxPages: 1,
    margin: '9mm',
  });
  const d = await renderPdf({
    html: R.buildDocument(key),
    outPath: path.join(OUT, `${up}_COMPLETION_RECORD.pdf`),
    margin: '15mm',
  });

  console.log(`${up}  visual   ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB`);
  console.log(`${up}  document ${d.pages} page(s)            ${(d.bytes / 1024).toFixed(0)} KB`);
}

async function main() {
  const only = process.argv[2];
  const keys = only ? [only] : ['r26', 'r25', 'r12'];
  for (const k of keys) {
    if (!D.TICKETS[k]) throw new Error(`unknown ticket "${k}" (have: ${Object.keys(D.TICKETS).join(', ')})`);
    await buildOne(k);
  }
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
