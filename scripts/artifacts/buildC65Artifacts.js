/**
 * Build C6.5's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC65Artifacts.js
 *
 * The assertions run before any PDF is written, and all of them read the repository the
 * audit is about. If someone guards getApolloQuota, raises a ceiling, flips the kill-switch
 * default or adds the missing tests, this build FAILS rather than shipping an audit that
 * describes a codebase that no longer exists.
 */
const path = require('path');
const D = require('./tickets/c65Data');
const R = require('./tickets/c65Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.5');

async function main() {
  const audited = D.assertFunctionsExist();
  const unguarded = D.assertUnguardedSetMatchesSource();
  const ceilings = D.assertCeilingsMatchSource();
  const untested = D.assertUntestedClaimsHold();
  const reusable = D.assertVerdictPerFunction();
  D.assertNoCreditBalanceClaimed();
  const tally = D.assertHeadlineMatchesVerdicts();

  const jobs = [
    { file: 'C65_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C65_2_APOLLO_AUDIT.pdf', html: R.buildDocument(), landscape: false, maxPages: 0,
      margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('\n  functions audited        : ' + audited + ', all still present in the source');
  console.log('  guarded call sites       : ' + D.GUARDED.join(', '));
  console.log('  billable but UNGUARDED   : ' + unguarded + ' (the audit\'s central finding)');
  console.log('  ceilings read from env   : ' + ceilings + ', kill switch defaults OFF');
  console.log('  untested claims verified : ' + untested + ' functions confirmed absent from every test file');
  console.log('  verdict tally            : ' + tally + ' (reusable=' + reusable + ' of ' + audited + ')');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
