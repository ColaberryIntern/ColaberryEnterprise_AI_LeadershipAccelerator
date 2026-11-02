/**
 * Build C10.2's two deliverables: the one-page decision sheet and the full record.
 *
 *   node scripts/artifacts/buildC102Artifacts.js
 *
 * THE GUARD THAT EARNS ITS KEEP runs the real price-agreement checker against the real
 * repository and refuses to produce a document claiming the surfaces agree unless they do.
 * The failure this prevents is the ordinary one: a confident PDF built from a data file that
 * was written before the last edit. It also runs the checker's own self-test first, because a
 * checker whose matcher has stopped matching would report a clean pass over code it never read.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('./tickets/c102Data');
const R = require('./tickets/c102Render');
const { renderPdf } = require('./renderArtifactPdf');
const { findAllBritishSpellings } = require('./britishSpellings');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C10.2');
const ROOT = path.join(__dirname, '..', '..');
const CHECKER = path.join(ROOT, 'scripts', 'checkPriceAgreement.js');

function runChecker(args, label) {
  try {
    return execFileSync(process.execPath, [CHECKER, ...args],
      { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    throw new Error(`${label} FAILS, so this document may not claim the surfaces agree:\n`
      + String(e.stdout || e.message).split('\n').slice(0, 10).join('\n'));
  }
}

/** The document says every wired surface reads one source. Prove it against the repo. */
function assertSurfacesActuallyAgree() {
  runChecker(['--self-test'], 'the price-agreement self-test');
  const out = runChecker([], 'the price-agreement check');

  // The document quotes how many hub files were scanned. If that number is a fiction the
  // whole coverage claim is too, so take it from the run rather than the data file.
  const m = /knowledge base: (\d+) files scanned, (\d+) lines state the canonical rate/.exec(out);
  if (!m) throw new Error('the checker no longer reports its knowledge-base coverage, so the '
    + 'figures this document quotes cannot be confirmed.');
  const scanned = Number(m[1]);
  const canonical = Number(m[2]);
  if (scanned !== D.GUARD.kbFilesScanned) {
    throw new Error(`the document says ${D.GUARD.kbFilesScanned} hub files were scanned; the `
      + `checker scanned ${scanned}. Update c102Data.js.`);
  }
  if (canonical !== D.GUARD.canonicalLines) {
    throw new Error(`the document says ${D.GUARD.canonicalLines} lines state the canonical rate; `
      + `the checker found ${canonical}. Update c102Data.js.`);
  }

  // The forecast is reported as NOT wired. If that stopped being true, the flag and the
  // criterion are both now overstating the problem, which is the dangerous way to be wrong.
  const disagrees = /forecast: DISAGREES/.test(out);
  if (!disagrees) {
    throw new Error('the checker no longer reports the forecast as disagreeing. If the forecast '
      + 'has been wired, criterion 2 and flag F1 both overstate the problem, which is the '
      + 'dangerous direction for a document to be wrong in, so rewrite them before this ships.');
  }
  return { scanned, canonical };
}

/** Every criterion that claims credit must show evidence for it. */
function assertEveryCriterionCitesEvidence() {
  for (const c of D.CRITERIA) {
    if (!c.evidence || c.evidence.length < 60) {
      throw new Error(`criterion ${c.n} claims "${c.verdict}" with no usable evidence`);
    }
  }
  return D.CRITERIA.length;
}

/**
 * American spelling, over the rendered text AND the source modules. Reading only the rendered
 * HTML was not enough on C0.12: a British spelling in a function name never renders, and the
 * repo's own spelling test caught it after CI had already gone green.
 */
function assertAmericanSpelling() {
  const fs = require('fs');
  const sources = [
    'scripts/artifacts/tickets/c102Data.js',
    'scripts/artifacts/tickets/c102Render.js',
    'scripts/artifacts/buildC102Artifacts.js',
    'scripts/checkPriceAgreement.js',
    'backend/src/services/membershipPrice.ts',
  ].map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');

  const rendered = `${R.buildVisual()} ${R.buildDocument()}`.replace(/<[^>]+>/g, ' ');
  const hits = findAllBritishSpellings(`${rendered}\n${sources}`);
  if (hits.length > 0) {
    const named = hits.slice(0, 6).map((h) => `${h.word} -> ${h.american}`).join(', ');
    throw new Error(`British spelling found: ${named}`);
  }
}

async function main() {
  const cov = assertSurfacesActuallyAgree();
  const criteria = assertEveryCriterionCitesEvidence();
  D.assertNoCriterionOverclaims();
  assertAmericanSpelling();

  const jobs = [
    { file: 'C102_1_PRICE_OF_RECORD.pdf', html: R.buildVisual(), landscape: true,
      maxPages: 1, margin: '10mm' },
    { file: 'C102_2_ONE_SOURCE_AND_GUARD.pdf', html: R.buildDocument(), landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  for (const j of jobs) {
    const r = await renderPdf({
      html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin,
    });
    console.log('  ' + j.file.padEnd(36) + r.pages + ' page(s)'
      + (j.maxPages ? ' (limit ' + j.maxPages + ')' : '') + '  '
      + (r.bytes / 1024).toFixed(0) + ' KB');
  }

  console.log('');
  console.log('  price agreement   : self-test AND real run PASS against the real repo');
  console.log('  hub coverage      : ' + cov.scanned + ' files, ' + cov.canonical + ' canonical lines');
  console.log('  price of record   : ' + D.VERDICT.priceOfRecord + ' = ' + D.VERDICT.annualCharge);
  console.log('  price sources     : ' + D.COUNTS.sourcesBefore + ' -> ' + D.COUNTS.sourcesAfter
    + '  (one source, plus the forecast setting that is still its own)');
  console.log('  surfaces wired    : ' + D.COUNTS.surfacesWired + ' of 4 (the forecast is open in ESC-002)');
  console.log('  mutations caught  : ' + D.COUNTS.mutations + '/' + D.COUNTS.mutations
    + ', self-test ' + D.COUNTS.selfTests + '/' + D.COUNTS.selfTests);
  console.log('  criteria          : ' + criteria + ' stated, each evidenced');
  console.log('  flags             : ' + D.FLAGS.filter((f) => f.severity.startsWith('open')).length
    + ' open, ' + D.FLAGS.filter((f) => f.severity === 'note').length + ' noted, '
    + D.FLAGS.filter((f) => f.severity === 'closed here').length + ' closed here');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - PR OPEN');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
