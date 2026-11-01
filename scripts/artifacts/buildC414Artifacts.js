/**
 * Build C4.14's two deliverables: the one-page decision sheet and the full record.
 *
 *   node scripts/artifacts/buildC414Artifacts.js
 *
 * THE GUARD THAT EARNS ITS KEEP runs the real claim checker over the real hub and refuses
 * to produce a document claiming the hub is clean unless it is. The failure this prevents
 * is the ordinary one: a PDF that says "zero blocked phrasings remaining" built from a
 * data file that was written before the last edit.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('./tickets/c414Data');
const R = require('./tickets/c414Render');
const { renderPdf } = require('./renderArtifactPdf');
const { findAllBritishSpellings } = require('./britishSpellings');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C4.14');
const CHECKER = path.join(__dirname, '..', 'checkKnowledgeHubClaims.js');

/** The document says the hub is clean. Prove it against the hub, not against the data file. */
function assertHubIsActuallyClean() {
  try {
    execFileSync(process.execPath, [CHECKER], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    throw new Error('the knowledge hub claim check FAILS, so this document may not say the '
      + 'hub is clean:\n' + String(e.stdout || e.message).split('\n').slice(0, 8).join('\n'));
  }
}

/** Every criterion claims MET. None may do so without evidence behind it. */
function assertEveryCriterionCitesEvidence() {
  for (const c of D.CRITERIA) {
    if (c.verdict !== 'MET') continue;
    if (!c.evidence || c.evidence.length < 60) {
      throw new Error(`criterion ${c.n} reads MET with no usable evidence`);
    }
  }
  return D.CRITERIA.length;
}

/** The three late-found phrasings are the finding. They may not quietly drop out. */
function assertTheMissedPhrasingsAreNamed() {
  const missed = D.PHRASINGS.filter((p) => p.missedByObviousSearch);
  if (missed.length < 3) {
    throw new Error(`only ${missed.length} phrasing(s) marked as missed by the obvious `
      + 'search; three were found late and all three belong in the record');
  }
  const doc = R.buildDocument();
  for (const p of missed) {
    if (!doc.includes(p.text)) throw new Error(`the document does not name "${p.text}"`);
  }
}

function assertAmericanSpelling() {
  const text = `${R.buildVisual()} ${R.buildDocument()}`.replace(/<[^>]+>/g, ' ');
  const hits = findAllBritishSpellings(text);
  if (hits.length > 0) {
    const named = hits.slice(0, 6).map((h) => `${h.word} -> ${h.american}`).join(', ');
    throw new Error(`British spelling in the document: ${named}`);
  }
}

async function main() {
  assertHubIsActuallyClean();
  const criteria = assertEveryCriterionCitesEvidence();
  assertTheMissedPhrasingsAreNamed();
  assertAmericanSpelling();

  const jobs = [
    { file: 'C414_1_CLAIM_REMOVAL.pdf', html: R.buildVisual(), landscape: true,
      maxPages: 1, margin: '10mm' },
    { file: 'C414_2_PHRASINGS_AND_GUARD.pdf', html: R.buildDocument(), landscape: false,
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

  const missed = D.PHRASINGS.filter((p) => p.missedByObviousSearch).length;
  console.log('');
  console.log('  hub claim check  : PASSES against the real hub');
  console.log('  files changed    : ' + D.COUNTS.files + '  (the ticket estimated 19)');
  console.log('  phrasings        : ' + D.COUNTS.phrasings
    + '  of which ' + missed + ' escaped a search for "5,000+"');
  console.log('  criteria         : ' + criteria + ' of ' + criteria + ' MET, each evidenced');
  console.log('  flags            : ' + D.FLAGS.filter((f) => f.severity === 'open').length
    + ' open, ' + D.FLAGS.filter((f) => f.severity === 'note').length + ' noted, '
    + D.FLAGS.filter((f) => f.severity === 'closed-here').length + ' closed here');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
