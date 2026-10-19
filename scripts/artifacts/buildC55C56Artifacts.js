/**
 * Build the four deliverables for C5.5 and C5.6, one PDF each.
 *
 *   node scripts/artifacts/buildC55C56Artifacts.js
 *
 * Assertions run before any PDF is written, and all of them read the repository rather
 * than this file. The one worth naming is assertNoSlugShadowing: segment routes are
 * generated from a boolean, so a slug that matches an existing literal path would mount a
 * page over the top of a working one, and no amount of careful reading catches that
 * reliably.
 */
const path = require('path');
const D = require('./tickets/c55c56Data');
const R = require('./tickets/c55c56Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts');

const JOBS = [
  { id: 'c55', dir: 'C5.5', file: 'C55_1_ONE_PAGE.pdf', visual: true },
  { id: 'c55', dir: 'C5.5', file: 'C55_2_ENTERPRISE_PAGE.pdf', visual: false },
  { id: 'c56', dir: 'C5.6', file: 'C56_1_ONE_PAGE.pdf', visual: true },
  { id: 'c56', dir: 'C5.6', file: 'C56_2_WORKFORCE_PAGE.pdf', visual: false },
];

async function main() {
  const ready = D.assertSegmentsReady();
  D.assertGeneratorRoutesThem();
  const literals = D.assertNoSlugShadowing();
  const copy = D.assertCopyIsClaimFree();
  const positioning = D.assertPositioningVerified();
  D.assertNothingClaimedLive();
  const pr = D.assertOnePrNumber();

  for (const j of JOBS) {
    const html = j.visual ? R.buildVisual(j.id) : R.buildDocument(j.id);
    const r = await renderPdf({
      html,
      outPath: path.join(OUT, j.dir, j.file),
      landscape: j.visual,
      maxPages: j.visual ? 1 : 0,
      margin: j.visual ? '10mm' : '15mm',
    });
    console.log('  ' + (j.dir + '/' + j.file).padEnd(40) + r.pages + ' page(s)'
      + (j.visual ? ' (limit 1)' : '') + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  segments now ready        : ' + ready);
  console.log('  generator routes them     : readySegments() inside the PublicLayoutV2 block');
  console.log('  slug shadowing            : none, against ' + literals + ' literal paths');
  console.log('  copy checked for claims   : ' + copy + ' segments, no price, no percentage');
  console.log('  positioning claim         : "' + positioning + '", VERIFIED');
  console.log('  nothing recorded as live  : the PR is unmerged and no production URL is claimed');
  console.log('  PR cited                  : ' + pr + ', the only PR number spelled anywhere');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
