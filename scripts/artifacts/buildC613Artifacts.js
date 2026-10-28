/**
 * Build C6.13's two deliverables: the one-page scorecard and the full target list.
 *
 *   node scripts/artifacts/buildC613Artifacts.js
 *
 * THE GUARDS THAT MATTER are the two that police the refinement Ali made on 2026-10-28.
 * The ticket's literal L&D disqualifier failed three of the ten, including the
 * best-fitting company on the list; he chose the narrower wording. Applying that by
 * flipping two verdicts to PASSES would have deleted the evidence that prompted the
 * decision, so assertOverturnedFindingsStayVisible fails the build if a returned
 * company has lost its finding or its standing watch, and
 * assertTheDisqualifierStillFilters fails it if the refined wording ever clears all ten
 * - a disqualifier that disqualifies nobody is decoration presented as diligence.
 *
 * assertEveryNegativeHasAControl is the third. Six of the ten have no open AI
 * requisition, and "we looked and found nothing" is worth nothing unless the search is
 * shown to work. Every NO carries a live posting retrieved from the same board.
 */
const path = require('path');
const D = require('./tickets/c613Data');
const C = require('./tickets/c613Criteria');
const R = require('./tickets/c613Render');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C6.13');

async function main() {
  const open = C.assertAllGuards();

  const jobs = [
    { file: 'C613_1_ONE_PAGE.pdf', html: R.buildVisual(), landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C613_2_TARGET_LIST.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(30) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  const met = C.criteria().filter((c) => c.verdict === 'MET').length;
  const names = (xs) => (xs.length ? xs.map((c) => c.name).join(', ') : '(none)');
  console.log('');
  console.log('  companies        : ' + D.COMPANIES.length
    + '  (enrolled ' + D.CAMPAIGN.enrolled + ', lead ids ' + D.CAMPAIGN.leadIdRange + ')');
  console.log('  criteria met     : ' + met + ' of ' + C.criteria().length);
  console.log('  disqualifier     : settled ' + D.DISQ_LD.decidedOn
    + ', enterprise-capability wording');
  console.log('  clear all checks : ' + C.CLEAN.length + '  -> ' + names(C.CLEAN));
  console.log('  disqualified     : ' + C.DISQUALIFIED.length
    + '  -> ' + names(C.DISQUALIFIED));
  console.log('  returned on watch: ' + C.OVERTURNED.length
    + '  -> ' + names(C.OVERTURNED));
  console.log('  unresolved       : ' + C.UNRESOLVED.length
    + '  -> ' + names(C.UNRESOLVED));
  console.log('  open AI req      : ' + C.WITH_REQ.length + '  -> ' + names(C.WITH_REQ));
  console.log('  rows with a flag : ' + open);
  console.log('');
  console.log('  campaign         : ' + D.CAMPAIGN.status + '/' + D.CAMPAIGN.qaStatus
    + ', gates ' + JSON.stringify(D.CAMPAIGN.activationGate)
    + ', ' + D.CAMPAIGN.touchpoints + ' touchpoints');
  console.log('');
  console.log('  REVIEW STATE: READY - ORDER OF APPROACH IS STILL ALI’S CALL');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
