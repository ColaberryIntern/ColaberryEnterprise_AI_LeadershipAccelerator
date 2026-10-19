/**
 * Build C5.8's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC58Artifacts.js
 *
 * The assertion that matters is assertNoLabPartnershipClaimed. This is a page about
 * partnering and `anthropic.partner` is DO_NOT_PUBLISH in the registry, so the one claim
 * that would be natural to make here is the one that has no evidence behind it. The guard
 * reads the shipped copy, and it also fails if the registry row itself changes state,
 * because a genuine authorization would mean rewriting this artifact rather than
 * overriding it.
 */
const path = require('path');
const D = require('./tickets/c58Data');
const R = require('./tickets/c58Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.8');

async function main() {
  const ready = D.assertSegmentReady();
  D.assertGeneratorRoutesIt();
  const literals = D.assertNoSlugShadowing();
  const capability = D.assertNoLabPartnershipClaimed();
  D.assertPartnerQuestionAnswered();
  D.assertCopyIsClaimFree();
  D.assertNothingClaimedLive();

  const jobs = [
    { file: 'C58_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C58_2_ECOSYSTEM_PAGE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  segments now ready       : ' + ready);
  console.log('  still unrouted           : ' + (D.UNREADY.join(', ') || 'none'));
  console.log('  slug shadowing           : none, against ' + literals + ' literal paths');
  console.log('  lab partnership claimed  : NO. anthropic.partner is '
    + D.PARTNER.verification + ' and the copy uses "' + capability + '" instead');
  console.log('  partner question answered: yes, before any capability claim');
  console.log('  nothing recorded as live : the PR is unmerged');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
