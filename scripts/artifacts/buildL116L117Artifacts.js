#!/usr/bin/env node
/**
 * Build DOC 16 (Ram Executive Brief, L11.6) and DOC 17 (Case Study Source Pack, L11.7).
 *
 * ORDER MATTERS AND IS DELIBERATE: write, then self-check, then render. The check compares the
 * file on disk against what the data renders, so it has to run after the write; and nothing is
 * rendered if either check fails, because a PDF is the artifact that gets attached to a ticket
 * and read by someone who will not re-run the build.
 *
 * BOTH DOCUMENTS ARE CHECKED BEFORE EITHER IS RENDERED. They ship in one pull request, so a
 * half-verified pair is not a useful state to leave behind.
 *
 * `--no-pdf` SKIPS RENDERING, AND MUST BE ASKED FOR. The renderer needs a playwright browser.
 * If that is unavailable the build FAILS rather than quietly producing documents without their
 * artifacts, because a silent skip is indistinguishable from a successful render in the output.
 * Passing the flag is a statement that the operator knows the PDFs are missing and why.
 *
 * Usage:
 *   node scripts/artifacts/buildL116L117Artifacts.js [--no-pdf]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const d16 = require('./tickets/l116Document');
const d17 = require('./tickets/l117Document');
const D16 = require('./tickets/l116Data');
const D17 = require('./tickets/l117Data');

const ROOT = path.join(__dirname, '..', '..');
const skipPdf = process.argv.includes('--no-pdf');

function line(s) { process.stdout.write(`${s}\n`); }

async function main() {
  line('L11.6 + L11.7 — the last two Colaberry Live documents');
  line('');

  // 1. WRITE.
  const f16 = d16.write();
  const f17 = d17.write();
  line(`wrote  ${path.relative(ROOT, f16)}`);
  line(`wrote  ${path.relative(ROOT, f17)}`);
  line('');

  // 2. SELF-CHECK BOTH. Either failure stops the build before anything renders.
  const r16 = d16.selfCheck();
  line(`DOC 16 self-check PASSED — ${r16.requirements} required explanations, `
    + `${r16.gaps} declared gaps, ${r16.vendors} vendors, ${r16.citedPaths} cited paths all `
    + `present, airing-blocked=${r16.airingBlocked} derived from the board, ${r16.bytes} bytes`);

  const r17 = d17.selfCheck();
  line(`DOC 17 self-check PASSED — ${r17.required} captures: ${r17.captured} captured, `
    + `${r17.notYet} not yet, ${r17.blocked} blocked; ${r17.evidencePaths} evidence paths all `
    + `present, ${r17.testSuites} test suites counted from disk, ${r17.bytes} bytes`);
  line('');

  // 3. RENDER.
  if (skipPdf) {
    line('PDF rendering SKIPPED by --no-pdf. The documents above are written and verified; '
      + 'their PDF artifacts are not built. This was requested explicitly.');
    return;
  }

  const { renderPdf } = require('./renderArtifactPdf');
  const outDir = path.join(ROOT, 'docs', 'artifacts');

  for (const [ticket, mod, data] of [['L11.6', d16, D16], ['L11.7', d17, D17]]) {
    const dir = path.join(outDir, ticket);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${ticket.replace('.', '_')}_${data.META.doc.replace(' ', '_')}.pdf`);
    // renderPdf counts the pages from the buffer it just produced and refuses to write a PDF it
    // cannot account for, so its return value is the only page count worth reporting.
    const res = await renderPdf({ html: mod.html(), outPath: out, maxPages: 0 });
    line(`rendered ${path.relative(ROOT, out)} (${res.pages} pages, ${res.bytes} bytes)`);
  }
}

main().catch((e) => {
  process.stderr.write(`\nBUILD FAILED: ${e.message}\n`);
  process.exit(1);
});
