/**
 * Build C7.8's and C7.9's deliverables. Four PDFs, two per ticket.
 *
 *   node scripts/artifacts/buildC78C79Artifacts.js
 *
 * ONE BUILD FOR TWO TICKETS, because the FAQ expands the one-pager and the two must never
 * disagree in front of a buyer. They read one data module and are rendered together, so a
 * change to the security position cannot land in one document and not the other.
 *
 * The assertion that matters is assertEveryLineTracesToC77. These are outbound documents,
 * so a line that is merely optimistic is a misrepresentation. Every line cites a finding id
 * from the C7.7 assessment, and the build refuses a line that cites nothing or cites an id
 * that does not exist.
 *
 * THE SECOND ASSERTION EXISTS BECAUSE THE FIRST VERSION WAS WRONG BY OMISSION. These pages
 * said "no certifications" and stopped there, which was literally accurate and materially
 * incomplete: a funded SOC 2 Type II and ISO 27001:2022 implementation had been running
 * since July 2026. Only overstatement was guarded, because overstatement is the worse
 * failure. Understatement loses the deal now, for nothing, and it is quieter.
 * `assertProgramIsNotOmitted` requires the program, its start date, and the limits that
 * keep a status from reading as a promise.
 */
const path = require('path');
const D = require('./tickets/c78c79Data');
const R = require('./tickets/c78c79Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C7.8-C7.9');

async function main() {
  const trace = D.assertEveryLineTracesToC77();
  D.assertNoUnheldCertificationImplied();
  // The other direction, added after the page was found to understate: it said "no
  // certifications" full stop while a funded SOC 2 and ISO 27001 implementation ran.
  const limits = D.assertProgramIsNotOmitted();
  D.assertTableAgreesWithProgram();
  const criticals = D.assertEveryCriticalGapIsDisclosed();
  const sub = D.assertSubprocessorsAreDisclosedHonestly();
  D.assertCopyIsClean();
  const checklist = D.assertChecklistIsActionable();

  const jobs = [
    // The client one-pager is the C7.8 deliverable, and "fits one page" is its criterion.
    { file: 'C78_1_SECURITY_ONE_PAGER.pdf', html: R.buildC78OnePager(), landscape: false,
      maxPages: 1, margin: '14mm' },
    { file: 'C78_2_TRACEABILITY.pdf', html: R.buildC78Traceability(), landscape: true,
      maxPages: 0, margin: '12mm' },
    { file: 'C79_1_ONE_PAGE.pdf', html: R.buildC79Visual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C79_2_PROCUREMENT_FAQ.pdf', html: R.buildC79Document(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const notYet = D.FAQ.filter((f) => f.state === 'NOT YET').length;
  console.log('');
  console.log('  lines traced to C7.7     : ' + trace.lines + ' lines, ' + trace.refs
    + ' references, against ' + trace.available + ' findings');
  console.log('  certifications claimed   : NONE. ' + D.HOLD_NOTHING.length
    + ' listed as not held');
  console.log('  in-progress program      : ' + D.IN_PROGRESS.what + ', since '
    + D.IN_PROGRESS.since);
  console.log('  stated limits on it      : ' + limits
    + ' (no auditor, no observation window, no report, no platform)');
  console.log('  critical gaps disclosed  : ' + criticals + ' of ' + criticals);
  console.log('  procurement questions    : ' + D.FAQ.length + ', of which ' + notYet
    + ' answered "not yet"');
  console.log('  subprocessors            : ' + sub.live + ' live of ' + sub.total
    + ' listed; Anthropic listed as NOT a subprocessor, measured');
  console.log('  buyer checklist          : ' + checklist + ' items, all actionable');
  console.log('  sent to anyone           : NO');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
