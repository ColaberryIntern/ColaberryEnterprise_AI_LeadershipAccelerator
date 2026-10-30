/**
 * Build C0.11's two deliverables: the one-page brief and the full record.
 *
 *   node scripts/artifacts/buildC011Artifacts.js
 *
 * THE GUARD THAT MATTERS is assertNoActionIsClaimedBeforeItHappens. This document goes
 * into the governance folder as the record of why money was or was not taken from a
 * student, and the easiest way for it to become a lie is to be written while the
 * suspension is still only prepared and then filed as though it were done. The first
 * criterion stays UNMET until ACTION.suspendedOn carries a real date.
 *
 * The second is assertCollectedEqualsSettlement. The entire justification is that we
 * have already collected exactly what was agreed; if that arithmetic ever stops holding,
 * this artifact must not be produced at all.
 */
const path = require('path');
const D = require('./tickets/c011Data');
const C = require('./tickets/c011Criteria');
const R = require('./tickets/c011Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C0.11');

async function main() {
  const met = C.assertAllGuards();

  const jobs = [
    { file: 'C011_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C011_2_SETTLEMENT_OVERCOLLECTION.pdf', html: R.buildDocument(),
      landscape: false, maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(38) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const cs = C.criteria();
  const left = R.daysBetween(D.OBSERVED, D.SCHEDULE.nextDraft);

  console.log('');
  console.log('  collected        : ' + C.fmt(C.collected()) + ' over ' + C.kept().length
    + ' payments   settlement ' + C.fmt(D.SETTLEMENT)
    + '   difference ' + C.fmt(C.collected() - D.SETTLEMENT));
  console.log('  schedule         : ' + D.SCHEDULE.id + ' ' + D.SCHEDULE.status
    + ', ' + C.fmt(D.SCHEDULE.amount) + ' due ' + D.SCHEDULE.nextDraft
    + '  (' + left + ' days from ' + D.OBSERVED + ')');
  console.log('  sweep            : ' + D.SWEEP.liveSchedulesFound + ' live of '
    + D.SWEEP.statusElevenContracts + ' paid-off contracts  -> '
    + D.SWEEP.liveScheduleOwners.join(', '));
  console.log('  naive sweep      : would return ' + D.SWEEP.naiveActive + ' rows, '
    + D.SWEEP.naiveActiveWithNoPaySimpleCustomer + ' with no PaySimple customer, '
    + 'and MISS the only real one');
  console.log('  criteria met     : ' + met + ' of ' + cs.length + '   ('
    + cs.map((c) => c.id + ':' + c.verdict).join(', ') + ')');
  console.log('  suspended        : '
    + (D.ACTION.suspendedOn || 'NO - prepared, dry run clean, awaiting Ali'));
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
