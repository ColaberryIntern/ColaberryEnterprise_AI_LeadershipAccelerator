/**
 * Build one Weekly Live Studio ticket's two close-out PDFs from its close-out record.
 *
 *   node scripts/artifacts/buildWlArtifacts.js <record.json> [--ledger <state-ledger.json>]
 *
 * Writes docs/artifacts/WL/<code>/<CODE>_VISUAL.pdf (one page, landscape, the renderer throws past one)
 * and <CODE>_DOCUMENT.pdf. With --ledger, enforces Ali's reuse rule before writing anything:
 * a PDF's sha256 may sit on at most 3 tickets in total, and the two PDFs of one ticket must differ.
 * Records the hashes in the ledger's pdf_usage map.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderPdf } = require('./renderArtifactPdf');
const { buildVisual, buildDocument, assertNoDashes } = require('./tickets/wlCloseout');

const MAX_TICKETS_PER_PDF = 3;

async function main() {
  const [recPath, flag, ledgerPath] = process.argv.slice(2);
  if (!recPath) throw new Error('usage: buildWlArtifacts.js <record.json> [--ledger <state-ledger.json>]');
  const r = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  assertNoDashes(r);
  const slug = r.code.replace(/\./g, '_');
  const out = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'WL', r.code);
  const jobs = [
    { name: `${slug}_VISUAL.pdf`, html: buildVisual(r), landscape: true, maxPages: 1, margin: '10mm' },
    { name: `${slug}_DOCUMENT.pdf`, html: buildDocument(r), landscape: false, maxPages: 0, margin: '15mm' },
  ];
  const results = [];
  for (const j of jobs) {
    const res = await renderPdf({ html: j.html, outPath: path.join(out, j.name), landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    const sha = crypto.createHash('sha256').update(fs.readFileSync(res.outPath)).digest('hex');
    results.push({ file: res.outPath, name: j.name, pages: res.pages, sha });
    console.log(`${j.name}  ${res.pages} page(s)  ${(res.bytes / 1024).toFixed(0)} KB  sha ${sha.slice(0, 12)}`);
  }
  if (results[0].sha === results[1].sha) throw new Error('the two PDFs of one ticket are identical; refusing');
  if (flag === '--ledger' && ledgerPath) {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledger.pdf_usage = ledger.pdf_usage || {};
    // A rebuild supersedes this ticket's earlier PDFs (they were never posted), so drop the ticket from
    // every older hash first; otherwise stale hashes would count against the reuse cap forever.
    for (const [sha, codes] of Object.entries(ledger.pdf_usage)) {
      const kept = codes.filter((c) => c !== r.code);
      if (kept.length) ledger.pdf_usage[sha] = kept; else delete ledger.pdf_usage[sha];
    }
    for (const x of results) {
      const used = ledger.pdf_usage[x.sha] || [];
      if (!used.includes(r.code) && used.length >= MAX_TICKETS_PER_PDF) {
        throw new Error(`${x.name} is already on ${used.length} tickets (${used.join(', ')}); the limit is ${MAX_TICKETS_PER_PDF}`);
      }
      ledger.pdf_usage[x.sha] = [...new Set([...used, r.code])];
    }
    if (ledger.tasks && ledger.tasks[r.code]) ledger.tasks[r.code].pdfs = results.map((x) => x.name);
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  }
  console.log(`written to ${out}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
