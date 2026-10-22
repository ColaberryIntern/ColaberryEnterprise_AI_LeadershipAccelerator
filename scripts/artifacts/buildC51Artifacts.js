/**
 * Build C5.1's deliverables.
 *
 *   node scripts/artifacts/buildC51Artifacts.js
 *
 * Three files, because the ticket names "site map + annotated wireframe HTML" and the
 * standing rule adds the one-page visual and the document as separate PDFs. The HTML is
 * written alongside so the wireframes can be opened and scrolled rather than only printed.
 *
 * The assertions ARE the ticket's acceptance criteria, and the route check re-reads the real
 * route tree every time this runs.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c51Data');
const R = require('./tickets/c51Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.1');

async function main() {
  const routes = D.assertRoutesFree();
  const traps = D.assertTrapsAreReallyTaken();
  D.assertHomepageTellsOneStory();
  const segments = D.assertOnePathToInquiry();

  const jobs = [
    { file: 'C51_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm', what: 'the one-page site map' },
    { file: 'C51_2_INFORMATION_ARCHITECTURE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm', what: 'the IA, with annotated wireframes' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(38) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  // The wireframes as HTML too, which is what the ticket names as the artifact.
  const htmlPath = path.join(OUT, 'C51_WIREFRAMES.html');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(htmlPath, R.buildDocument());
  console.log('  ' + 'C51_WIREFRAMES.html'.padEnd(38)
    + (fs.statSync(htmlPath).size / 1024).toFixed(0) + ' KB  -- the same content, scrollable');

  const fulfilled = routes.fulfilled || [];
  console.log('\n  routes checked against the real tree : ' + routes.checked
    + ' proposed against ' + routes.declared + ' declared, '
    + (routes.checked - fulfilled.length) + ' still free, '
    + fulfilled.length + ' now built at the route this IA proposed');
  if (fulfilled.length) {
    console.log('    fulfilled                          : ' + fulfilled.join(', '));
  }
  console.log('  taken routes confirmed still taken   : ' + traps);
  console.log('  homepage names no segment            : assertion holds');
  console.log('  segments with exactly one inquiry    : ' + segments);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
