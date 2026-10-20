/**
 * Build C8.9's two deliverables, one PDF each.
 *
 *   node scripts/artifacts/buildC89Artifacts.js
 *
 * The assertion that matters is assertEmptinessIsNotDressedUp. The ticket's named failure
 * mode is declaring the work done against a schema that exists and holds no rows, so the
 * build refuses to mark the "real rows" criterion MET while org_cohorts is empty - and
 * equally refuses to keep shipping a stale BLOCKED once rows appear.
 *
 * assertMechanismExists is the other half: criterion 1 is reported MET on the strength of
 * code and a test that are read from disk at build time, not on memory.
 */
const path = require('path');
const D = require('./tickets/c89Data');
const R = require('./tickets/c89Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C8.9');

async function main() {
  D.assertMechanismExists();
  const rows = D.assertEmptinessIsNotDressedUp();
  D.assertIsolationGapIsStated();
  const pool = D.assertProspectPoolIsFlagged();
  const criteria = D.assertEveryCriterionHasEvidence();
  D.assertCopyIsClean();

  const jobs = [
    { file: 'C89_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C89_2_COHORT_ORG_JOIN.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const verdicts = D.CRITERIA.map((c) => `${c.n}:${c.verdict}`).join('  ');
  console.log('');
  console.log('  criteria                 : ' + criteria + '  ' + verdicts);
  console.log('  code written             : NONE. The mechanism is built, scoped and tested.');
  console.log('  org_cohorts rows         : ' + rows + '  (the gap, unchanged)');
  console.log('  isolation (C7.7 G2)      : tenant_memberships='
    + D.MEASURED.tenantMemberships + ' of ' + D.MEASURED.tenants
    + ' tenants, so criterion 3 is unreachable here');
  console.log('  prospect pool flagged    : ' + pool + ' learners, NOT a candidate');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
