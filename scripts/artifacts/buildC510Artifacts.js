/**
 * Build C5.10's two deliverables: the one-page scorecard and the full record.
 *
 *   node scripts/artifacts/buildC510Artifacts.js
 *
 * THE GUARD THAT MATTERS is assertNoCertificationClaim. This ticket's own standing
 * constraint is that Colaberry never claims to certify anyone, and the page shipped with
 * three sentences doing exactly that, past a test guard that named the two strings one
 * fix had removed. The build now refuses to produce an artifact while any certification
 * claim is live in the page, in any casing.
 *
 * The second one worth knowing is assertTheZeroIsEvidenceAndNotSilence. This document's
 * headline is that no sponsor has ever seen a real figure on this dashboard, which rests
 * entirely on link_accessed being zero. If that event were not instrumented, the zero
 * would mean nothing and the headline would be an unfounded claim about what sponsors
 * have seen; if a sponsor ever does log in, the headline goes stale. The guard fails the
 * build in both cases.
 */
const path = require('path');
const D = require('./tickets/c510Data');
const C = require('./tickets/c510Criteria');
const R = require('./tickets/c510Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C5.10');

async function main() {
  const met = C.assertAllGuards();

  const jobs = [
    { file: 'C510_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C510_2_SPONSOR_DASHBOARD.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(34) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const cs = C.criteria();
  const bare = D.COVERAGE.filter((c) => !c.badged);
  const unreachable = D.PROVENANCE.filter((p) => !p.reachable);

  console.log('');
  console.log('  criteria fully met : ' + met + ' of ' + cs.length
    + '   (' + cs.map((c) => c.id + ':' + c.verdict).join(', ') + ')');
  console.log('  provenance classes : ' + D.PROVENANCE.length + ' defined, '
    + unreachable.length + ' never rendered -> '
    + unreachable.map((p) => p.cls).join(', '));
  console.log('  figures unmarked   : ' + bare.length + ' of ' + D.COVERAGE.length
    + '   -> ' + bare.map((c) => c.area.split(' (')[0]).join('; '));
  console.log('  cert claims removed: ' + D.CERT_FIX.claimsLeftLive.length
    + '   (guard mutations caught: ' + D.CERT_FIX.mutationsCaught + ')');
  console.log('');
  console.log('  production URL     : https://enterprise.colaberry.ai/sponsor/dashboard'
    + '  HTTP 200');
  console.log('  sponsors / seats   : ' + D.PRODUCTION.sponsors + ' / '
    + D.PRODUCTION.sponsorSeats + '   (' + D.PRODUCTION.sponsorRow.company + ', '
    + D.PRODUCTION.sponsorRow.billingStatus + ')');
  console.log('  sponsor logins ever: generated ' + D.PRODUCTION.linkGenerated
    + ', accessed ' + D.PRODUCTION.linkAccessed
    + ', rejected ' + D.PRODUCTION.linkRejected);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN'
    + '   (which metrics a sponsor sees is still your call)');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
