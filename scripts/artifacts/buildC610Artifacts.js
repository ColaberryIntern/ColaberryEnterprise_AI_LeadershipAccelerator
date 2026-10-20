/**
 * Build C6.10's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC610Artifacts.js
 *
 * The assertion that matters is assertGateIsWiredIntoActivation. The ticket's third
 * acceptance criterion is that the gate BLOCKS activation rather than merely advising, and
 * a gate that exists but is never called is advice with extra steps. That check reads
 * campaignService.ts and fails if the call is missing OR if it sits after campaign.update,
 * because a gate that throws once the write has happened is not a gate.
 *
 * The checks themselves are parsed out of campaignActivationGate.ts rather than restated,
 * so this document cannot describe a gate that is not there.
 */
const path = require('path');
const D = require('./tickets/c610Data');
const R = require('./tickets/c610Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.10');

async function main() {
  const checks = D.assertEveryCheckHasOwnerAndMethod();
  D.assertGateIsWiredIntoActivation();
  const sig = D.assertNoBypass();
  const split = D.assertAutomationSplitIsHonest();
  const measured = D.assertMeasurementIsStated();
  D.assertCopyIsClean();

  const jobs = [
    { file: 'C610_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C610_2_ACTIVATION_GATE.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  checks, read from the service : ' + checks
    + ' (' + split.automated + ' automated, ' + split.manual.length + ' attested)');
  console.log('  wired into activateCampaign   : YES, before campaign.update');
  console.log('  bypass parameter              : none. signature is (' + sig + ')');
  console.log('  LIVE BUT NEVER APPROVED       : ' + measured.activeButUnapproved
    + ' campaigns, incl. ' + measured.unapprovedExample);
  console.log('  governance configs            : ' + measured.governanceConfigs
    + ' of ' + measured.campaigns + ', so nothing passes the gate today');
  console.log('  recovery blocked until fixed  : ' + measured.pausedAndDraft
    + ' paused campaigns on approval_status=draft');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
