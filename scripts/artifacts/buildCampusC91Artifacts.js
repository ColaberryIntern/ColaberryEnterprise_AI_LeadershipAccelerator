/**
 * Build Campus C91's two deliverables: the one-page dashboard and the audit-and-decision report.
 *
 *   node scripts/artifacts/buildCampusC91Artifacts.js
 *
 * THE ASSERTIONS THAT MATTER: the funnel only narrows, and the before/after split adds up to the funnel's signup count.
 * Both numbers come from separate queries (run.sh funnel vs run.sh cutover), so a mismatch means one was re-run against
 * a different moment and the documents would disagree with each other.
 */
const path = require('path');
const D = require('./tickets/campusC91Data');
const R = require('./tickets/campusC91Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'campus-C91');

async function main() {
  const signups = D.assertFunnelNarrows();
  const split = D.assertCutoverMatchesFunnel();

  const jobs = [
    { file: 'C91_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1, margin: '9mm' },
    { file: 'C91_2_AD_FUNNEL_AUDIT_AND_DECISION.pdf', html: R.buildDocument(), landscape: false, maxPages: 0, margin: '15mm' },
  ];
  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file), landscape: j.landscape,
      maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(44) + r.pages + ' page(s)' + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '')
      + '  ' + (r.bytes / 1024).toFixed(0) + ' KB');
  }
  console.log('');
  console.log('  ad Explorers in the funnel : ' + signups);
  console.log('  before + after split       : ' + split + ' (matches)');
  console.log('  figures as of              : ' + D.AS_OF);
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
