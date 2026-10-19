/**
 * Build C6.8's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC68Artifacts.js
 *
 * The assertion that matters is assertStopRuleIsNumeric. The ticket's named failure is
 * "no stop rule", and a stop rule whose conditions are prose is the same failure wearing a
 * section heading. Every condition must carry a number, and at least two must kill the
 * SEQUENCE rather than one contact, because a rule that only ever stops one person is not
 * a brake on volume.
 *
 * assertEveryClaimIsPublishable reads the real claim registry rather than a copy of it, so
 * a claim downgraded later stops this building instead of letting the copy keep asserting
 * it. That check is what turned up the finding in the output below.
 */
const path = require('path');
const D = require('./tickets/c68Data');
const R = require('./tickets/c68Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.8');

async function main() {
  const stops = D.assertStopRuleIsNumeric();
  const claims = D.assertEveryClaimIsPublishable();
  const conflicted = D.assertNoProhibitedWord();
  const nonAffiliation = D.assertNonAffiliationWhereRequired();
  D.assertTierOneExcluded();
  D.assertLinkedInGapStated();
  const activation = D.assertNothingActivated();

  const jobs = [
    { file: 'C68_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C68_2_TIER2_SEQUENCE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(32) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const sequenceStops = D.STOP_RULE.filter((r) => r.scope === 'SEQUENCE').length;
  console.log('');
  console.log('  touches                  : ' + activation.touches + ' over '
    + D.TOUCHES[D.TOUCHES.length - 1].day + ' days');
  console.log('  stop conditions          : ' + stops + ', all numeric, '
    + sequenceStops + ' of them kill the SEQUENCE');
  console.log('  claims cited             : ' + claims.used.length + ' of '
    + claims.registrySize + ', all VERIFIED or OWNER_ATTESTED');
  console.log('  non-affiliation line     : on ' + nonAffiliation + ' touches (CLM-025)');
  console.log('  "free" conflict          : ' + conflicted.join(', ')
    + ' are publishable AND carry the word; neither is used');
  console.log('  unsubscribe path         : documented, LinkedIn gap stated');
  console.log('  configured to send       : ' + (activation.configured ? 'YES' : 'NO'));
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
