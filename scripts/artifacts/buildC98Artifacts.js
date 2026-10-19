/**
 * Build C9.8's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC98Artifacts.js
 *
 * The assertion that matters is assertNothingObservedWithoutAConversation. C9.8 asks ten
 * questions, eight of which are about what buyers said, and the measured number of buyer
 * conversations is zero. A brief that laundered our own preparation into market evidence
 * would be worse than the failure the ticket names, because somebody might act on it.
 */
const path = require('path');
const D = require('./tickets/c98Data');
const R = require('./tickets/c98Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C9.8');

async function main() {
  const answered = D.assertEveryQuestionAnswered();
  const observed = D.assertNothingObservedWithoutAConversation();
  const ends = D.assertEndsInADecision();
  const empty = D.assertNoEvidenceSectionsStayEmpty();

  // The prose states counts; they are checked against the sections. The first draft said
  // eight NO EVIDENCE when six were, and eight plus four does not make ten.
  const R2 = require('./tickets/c98Render');
  const counts = D.assertCountsMatchSections(R2.buildVisual() + R2.buildDocument());

  const jobs = [
    { file: 'C98_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C98_2_WEEKLY_BRIEF_01.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '14mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(28) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  weekly questions answered     : ' + answered + ' of ' + answered);
  console.log('  buyer conversations in period : ' + D.CONVERSATIONS.count
    + ', measured against production');
  console.log('  sections marked OBSERVED      : ' + observed
    + ' (must be 0 while the count is 0)');
  console.log('  NO EVIDENCE sections, kept empty: ' + empty);
  console.log('  ends in                       : ' + ends);
  console.log('  prose counts match sections   : ' + counts);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
