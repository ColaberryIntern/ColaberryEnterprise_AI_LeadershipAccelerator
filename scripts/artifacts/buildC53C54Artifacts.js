/**
 * Build the four deliverables for C5.3 and C5.4, one PDF each.
 *
 *   node scripts/artifacts/buildC53C54Artifacts.js
 *
 * Two tickets, two PDFs apiece: the one-page visual first, then the document, per the
 * standing rule that every ticket ships both and that each item is its own PDF rather than
 * one combined file.
 *
 * The assertions run BEFORE any PDF is written, so a wrong artifact is never produced in
 * the first place. They read the repo rather than this file: if the route is deleted, if a
 * stage the C2.2 audit called a gap is relabelled as platform capability, if a quoted claim
 * stops being VERIFIED, or if a production URL is recorded while the PR is unmerged, the
 * build fails and says which.
 */
const path = require('path');
const D = require('./tickets/c53c54Data');
const R = require('./tickets/c53c54Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts');

const JOBS = [
  { id: 'c53', dir: 'C5.3', file: 'C53_1_ONE_PAGE.pdf', visual: true },
  { id: 'c53', dir: 'C5.3', file: 'C53_2_HOW_IT_WORKS_PAGE.pdf', visual: false },
  { id: 'c54', dir: 'C5.4', file: 'C54_1_ONE_PAGE.pdf', visual: true },
  { id: 'c54', dir: 'C5.4', file: 'C54_2_ACCELERATOR_PAGE.pdf', visual: false },
];

async function main() {
  const lines = D.assertRoutesDeclared();
  const people = D.assertStagesMatchAudit();
  const duration = D.assertClaimsVerified();
  const scanned = D.assertNoUnsourcedDurationInSource();
  D.assertNothingClaimedLive();
  const criteria = D.assertEveryCriterionHasEvidence();

  for (const j of JOBS) {
    const html = j.visual ? R.buildVisual(j.id) : R.buildDocument(j.id);
    const r = await renderPdf({
      html,
      outPath: path.join(OUT, j.dir, j.file),
      landscape: j.visual,
      maxPages: j.visual ? 1 : 0,
      margin: j.visual ? '10mm' : '15mm',
    });
    console.log('  ' + (j.dir + '/' + j.file).padEnd(44) + r.pages + ' page(s)'
      + (j.visual ? ' (limit 1)' : '') + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  routes declared in App.tsx : lines ' + lines + ', both inside the public layout');
  console.log('  stages delivered by people : ' + people + ', matching the C2.2 audit');
  console.log('  registry duration quoted   : "' + duration + '", VERIFIED');
  console.log('  source files scanned       : ' + scanned + ', none states an unsourced duration');
  console.log('  nothing recorded as live   : the PR is unmerged and no production URL is claimed');
  console.log('  acceptance criteria        : ' + criteria + ' across both tickets, each with evidence');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
