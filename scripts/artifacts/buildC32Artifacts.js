/**
 * Build C3.2's meeting package: SEVEN PDFs, one per item, plus the combined HTML.
 *
 * The ticket said "PDF not generated before approval", so the first build emitted HTML only.
 * Ali corrected that on 16 October 2026: a bundle ships one PDF per item, because Basecamp does
 * not preview HTML and a linked bundle shows the reader none of the seven things the comment
 * claims. His words: "i don't see these highlighted things."
 *
 *   node scripts/artifacts/buildC32Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c32Data');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.2');
const NAME = 'C32_ANTHROPIC_MEETING_PACKAGE.html';

async function main() {
  // Each of these throws rather than warning; a bundle that fails a criterion is not written.
  const cited = D.assertRegistryGated();
  const ask = D.assertOneAsk();

  const html = require('./tickets/c32Bundle').build();
  const openai = D.assertNoOpenAI(html);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, NAME), html);

  console.log(NAME + '  ' + (html.length / 1024).toFixed(0) + ' KB  (combined document)');
  console.log('  registry-gated claims : ' + cited.length + '  ' + cited.join(' '));
  console.log('  single ask            : slide ' + ask.n + ', "' + ask.title + '"');
  console.log('  OpenAI mentions       : ' + openai.hits + ' found, ' + openai.allowed
    + ' allowed by CLM-025');
  console.log('');

  // One PDF per item in the bundle. Each is re-checked for competing-lab content in its own
  // right, because once attached each one travels on its own.
  const parts = require('./tickets/c32Parts').parts();
  for (const p of parts) {
    D.assertNoOpenAI(p.html);
    const r = await renderPdf({ html: p.html, outPath: path.join(OUT, p.file),
      maxPages: p.maxPages, margin: '15mm' });
    console.log('  ' + p.n + '. ' + p.file.padEnd(34) + r.pages + ' page(s)'
      + (p.maxPages ? ' (limit ' + p.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }
  console.log('');
  console.log(parts.length + ' item PDFs + 1 combined html');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
