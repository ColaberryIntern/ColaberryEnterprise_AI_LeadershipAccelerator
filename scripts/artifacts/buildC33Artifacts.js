/**
 * Build C3.3's target map: the HTML and CSV the ticket asks for, plus the two PDFs the standing
 * artifact rule asks for. C3.3 carries no "HTML only" restriction, unlike C3.2.
 *
 * The acceptance criteria are checked rather than promised:
 *   - no guessed email addresses  -> assertNoPersonalEmail against every rendered output
 *   - every title has a source    -> assertSourced
 *   - tier 1 and tier 2 split     -> assertSourced
 *   - a specific researched opening per target -> asserted below
 *
 *   node scripts/artifacts/buildC33Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c33Data');
const R = require('./tickets/c33Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.3');

async function main() {
  const tiers = D.assertSourced();

  // Every target needs an opening, or an explicit statement that none was found. A blank is the
  // failure mode this check exists for: it would read as "we did not look".
  const blank = D.TARGETS.filter((t) => !t.opening || t.opening.length < 20);
  if (blank.length) throw new Error('targets with no opening: ' + blank.map((t) => t.name).join(', '));

  const doc = R.buildDocument();
  const vis = R.buildVisual();
  const csv = R.buildCsv();

  // Run the address guard over everything a reader could receive.
  const mail = D.assertNoPersonalEmail(doc + vis + csv);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'C33_ANTHROPIC_TARGET_MAP.html'), doc);
  fs.writeFileSync(path.join(OUT, 'C33_ANTHROPIC_TARGET_MAP.csv'), csv);

  const jobs = [
    { name: 'C33_ANTHROPIC_TARGET_MAP_1PAGE.pdf', html: vis, landscape: true, maxPages: 1,
      margin: '10mm', what: 'the visual, one page, landscape' },
    { name: 'C33_ANTHROPIC_TARGET_MAP.pdf', html: doc, landscape: false, maxPages: 0,
      margin: '15mm', what: 'the document' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.name),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log(`${j.name}  ${r.pages} page(s)${j.maxPages ? ` (limit ${j.maxPages})` : ''}  `
      + `${(r.bytes / 1024).toFixed(0)} KB  -- ${j.what}`);
  }

  console.log('C33_ANTHROPIC_TARGET_MAP.html  ' + (doc.length / 1024).toFixed(0) + ' KB');
  console.log('C33_ANTHROPIC_TARGET_MAP.csv   ' + (csv.trim().split('\n').length - 1) + ' rows');
  console.log('  tier split            : ' + tiers.tier1 + ' tier 1, ' + tiers.tier2 + ' tier 2');
  console.log('  email addresses       : ' + mail.found + ' found, all published org desks');
  console.log('  warm paths found      : 0 of ' + D.WARM_PATHS.length + ' candidates');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
