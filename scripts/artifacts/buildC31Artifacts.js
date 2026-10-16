/**
 * Build C3.1's two PDFs.
 *
 * The visual is capped at ONE page and the renderer throws rather than writing a second, so a
 * clean exit here is evidence of a one-page visual rather than a claim about one.
 *
 *   node scripts/artifacts/buildC31Artifacts.js
 */
const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.1');

async function main() {
  const jobs = [
    {
      name: 'C31_ANTHROPIC_ROUTE_1PAGE.pdf',
      html: require('./tickets/c31Visual').build(),
      landscape: true,
      maxPages: 1,
      margin: '10mm',
      what: 'the visual, one page, landscape',
    },
    {
      name: 'C31_ANTHROPIC_ROUTE.pdf',
      html: require('./tickets/c31Document').build(),
      landscape: false,
      maxPages: 0,
      margin: '15mm',
      what: 'the document',
    },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html,
      outPath: path.join(OUT, j.name),
      landscape: j.landscape,
      maxPages: j.maxPages,
      margin: j.margin,
    });
    const cap = j.maxPages ? ` (limit ${j.maxPages})` : '';
    console.log(`${j.name}  ${r.pages} page(s)${cap}  ${(r.bytes / 1024).toFixed(0)} KB  `
      + `mermaid=${r.mermaid}  -- ${j.what}`);
  }
  console.log(`\nwritten to ${OUT}`);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
