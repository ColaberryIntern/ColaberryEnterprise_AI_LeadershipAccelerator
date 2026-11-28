/**
 * Build the one-page visual and the completion document for each of the eight ungrouped Agent
 * Factory tickets closed on 2026-11-28.
 *
 *   node scripts/artifacts/buildAf14CloseoutArtifacts.js
 *
 * Sixteen PDFs, two per ticket, every one distinct: the close gate counts a PDF by its bytes, and
 * a recycled visual is exactly what that rule exists to catch. The run prints a SHA-256 per file
 * and fails if any two match, so the gate never has to catch it in the first place.
 *
 * Output: docs/artifacts/AF14-CLOSEOUT-2026-11-28 (gitignored; the repo is public and artifacts
 * never land in it).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/af14CloseoutRender');
const { TICKETS } = require('./tickets/af14CloseoutData');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'AF14-CLOSEOUT-2026-11-28');

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function main() {
  const hashes = new Map();

  for (const key of Object.keys(TICKETS)) {
    const t = TICKETS[key];
    const visualPath = path.join(OUT, `${t.slug}_1PAGE.pdf`);
    const docPath = path.join(OUT, `${t.slug}_COMPLETION.pdf`);

    const v = await renderPdf({
      html: R.buildVisual(key),
      outPath: visualPath,
      landscape: true,
      maxPages: 1,
      margin: '9mm',
    });
    const d = await renderPdf({
      html: R.buildDocument(key),
      outPath: docPath,
      margin: '15mm',
    });

    for (const p of [visualPath, docPath]) {
      const h = sha(p);
      if (hashes.has(h)) {
        throw new Error(`identical bytes: ${path.basename(p)} and ${path.basename(hashes.get(h))}`);
      }
      hashes.set(h, p);
    }

    console.log(
      `${t.code.padEnd(10)} visual ${v.pages}p ${(v.bytes / 1024).toFixed(0).padStart(4)}KB `
      + `${sha(visualPath).slice(0, 8)}   completion ${d.pages}p `
      + `${(d.bytes / 1024).toFixed(0).padStart(4)}KB ${sha(docPath).slice(0, 8)}`,
    );
  }

  console.log(`\n${hashes.size} files, ${hashes.size} distinct hashes`);
  console.log(`written to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
