/**
 * Build the C4 sales set: C4.1 the master deck, C4.2 the one-pager, C4.3 the capability
 * statement. One PDF per ticket, plus the HTML each ticket names.
 *
 *   node scripts/artifacts/buildC4SalesSet.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c4Data');
const R = require('./tickets/c4Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4-sales');

async function main() {
  const deck = R.buildDeck();
  const onePager = R.buildOnePager();
  const capability = R.buildCapability();
  const tiers = D.assertNothingDarkUnderLive();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'C41_MASTER_DECK.html'), deck.html);
  fs.writeFileSync(path.join(OUT, 'C42_ONE_PAGER.html'), onePager);
  fs.writeFileSync(path.join(OUT, 'C43_CAPABILITY_STATEMENT.html'), capability);

  const jobs = [
    { file: 'C41_MASTER_DECK.pdf', html: deck.html, maxPages: 0, margin: '14mm',
      what: 'C4.1, one slide per page' },
    { file: 'C42_ONE_PAGER.pdf', html: onePager, maxPages: 1, margin: '14mm',
      what: 'C4.2, and it must fit one page' },
    { file: 'C43_CAPABILITY_STATEMENT.pdf', html: capability, maxPages: 0, margin: '15mm',
      what: 'C4.3, three tiers' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB  -- ' + j.what);
  }

  console.log('');
  console.log('  registry claims cited : ' + deck.cited.length + '  ' + deck.cited.join(' '));
  console.log('  single next step      : slide ' + deck.next.n + ', "' + deck.next.title + '"');
  console.log('  capability tiers      : ' + tiers.live + ' live, ' + tiers.pilot + ' pilot, '
    + tiers.roadmap + ' roadmap groups');
  console.log('  flag-gated under live : none, asserted');
  console.log('');
  console.log('written to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
