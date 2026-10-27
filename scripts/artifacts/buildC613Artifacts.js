/**
 * Build C6.13's two deliverables: the one-page scorecard and the full target list.
 *
 *   node scripts/artifacts/buildC613Artifacts.js
 *
 * THE GUARD THAT MATTERS is assertDisqualifiedAreNotHidden. Three of the ten fail the
 * ticket's own L&D disqualifier, and the tempting move - the one that makes the
 * artifact look finished - is to quietly drop the list to seven, or to quietly keep all
 * ten and not mention it. Either would settle a question the ticket reserves to Ali in
 * as many words: "What does Ali need to personally review or decide? The final ten and
 * the order."
 *
 * assertEveryNegativeHasAControl is the second. Six of the ten have no open AI
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
  console.log('');
  console.log('  companies        : ' + D.COMPANIES.length
    + '  (enrolled ' + D.CAMPAIGN.enrolled + ', lead ids ' + D.CAMPAIGN.leadIdRange + ')');
  console.log('  criteria met     : ' + met + ' of ' + C.criteria().length
    + '  (criterion 3 is a CHECK, not a pass/fail)');
  console.log('  clear all checks : ' + C.CLEAN.length
    + '  -> ' + C.CLEAN.map((c) => c.name).join(', '));
  console.log('  L&D disqualified : ' + C.DISQUALIFIED.length
    + '  -> ' + C.DISQUALIFIED.map((c) => c.name).join(', '));
  console.log('  L&D unresolved   : ' + C.UNRESOLVED.length
    + '  -> ' + C.UNRESOLVED.map((c) => c.name).join(', '));
  console.log('  open AI req      : ' + C.WITH_REQ.length
    + '  -> ' + C.WITH_REQ.map((c) => c.name).join(', '));
  console.log('  open questions   : ' + open);
  console.log('');
  console.log('  campaign         : ' + D.CAMPAIGN.status + '/' + D.CAMPAIGN.qaStatus
    + ', gates ' + JSON.stringify(D.CAMPAIGN.activationGate)
    + ', ' + D.CAMPAIGN.touchpoints + ' touchpoints');
  console.log('');
  console.log('  REVIEW STATE: BLOCKED - ALI DECISION REQUIRED');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
