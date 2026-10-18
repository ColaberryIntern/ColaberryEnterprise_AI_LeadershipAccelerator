/**
 * Build C6.4's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC64Artifacts.js
 *
 * REQUIRES the three run files under tmp/ (c64_owned.json, c64_search.json,
 * c64_contacts.json). They hold named people and verified email addresses, this repository
 * is PUBLIC, and .gitignore covers them by pattern. The first assertion refuses to build if
 * any of them has become tracked by git.
 *
 * The assertions run before any PDF is written. The spend reconciliation is the important
 * one: per the C6.5 audit a refused Apollo call returns an empty result indistinguishable
 * from a genuine miss, so unless the counter delta equals the calls made, a truncated run
 * would be published as a list of unreachable accounts.
 */
const path = require('path');
const D = require('./tickets/c64Data');
const R = require('./tickets/c64Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.4');

async function main() {
  const guarded = D.assertSourcesAreNotCommitted();
  const published = D.assertNoGuessedEmails();
  const flagged = D.assertFlaggedNotFilled();
  const nearMiss = D.assertProbableNeverPublished();
  const spend = D.assertSpendReconciles();
  D.assertOwnedNotSoldAsBuyer();

  const jobs = [
    { file: 'C64_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C64_2_BUYER_MAP.pdf', html: R.buildDocument(), landscape: false, maxPages: 0,
      margin: '14mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(26) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  source files, none tracked by git : ' + guarded);
  console.log('  buyers published, emails from Apollo unchanged : ' + published);
  console.log('  accounts flagged rather than filled : ' + flagged);
  console.log('  near-miss institutions never published : ' + nearMiss);
  console.log('  spend reconciled : ' + spend + ', ending at '
    + D.SPEND.enrichAfter + ' of ' + D.SPEND.limit);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
