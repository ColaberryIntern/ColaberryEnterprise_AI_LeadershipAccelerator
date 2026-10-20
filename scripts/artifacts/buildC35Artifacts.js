/**
 * Build C3.5's OpenAI meeting package: a one-page visual, the full bundle, and the HTML.
 *
 *   node scripts/artifacts/buildC35Artifacts.js
 *
 * PDFS ARE NOW GENERATED, AND THE SEQUENCE WAS THE CRITERION. "PDF not generated before
 * approval" meant the documents could not be rendered until Ali had read them. He asked to
 * see them on 20 October 2026, so they render now; `assertNoPdfRequested` still refuses a
 * PDF job unless an approval record exists, so the criterion is enforced rather than
 * deleted.
 *
 * The assertion that matters is assertZeroAnthropicContent. The ticket calls leakage an
 * explicit failure condition, and it is the kind that is invisible on a reread: a sentence
 * written for the other lab survives because it is a good sentence. The guard imports the
 * contact names from C3.3 rather than restating them, so it cannot drift from the list it
 * protects against, and it bans two registry claims that are VERIFIED and perfectly
 * publishable everywhere else.
 *
 * The assertion that CHANGED is the figure guard, and it is worth reading why. It used to
 * refuse the ten-million-by-2030 commitment outright because that number appeared nowhere
 * in this repository. That reasoning confused "we have not looked it up" with "it is not
 * true": the figure is OpenAI's own, stated twice in their newsroom. The guard now demands
 * a source for each headline figure and checks that neither number is bolted to the
 * other's population, which is right in both directions rather than only until the facts
 * move.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c35Data');
const B = require('./tickets/c35Bundle');
const { renderPdf } = require('./renderArtifactPdf');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.5');

async function main() {
  const bundleHtml = B.buildBundle();
  const visualHtml = B.buildVisual();

  const jobs = [
    { file: 'C35_1_ONE_PAGE.pdf', html: visualHtml, landscape: true, maxPages: 1,
      margin: '10mm' },
    { file: 'C35_2_OPENAI_MEETING_PACKAGE.pdf', html: bundleHtml, landscape: false,
      maxPages: 0, margin: '15mm' },
  ];

  const terms = D.assertZeroAnthropicContent();
  const claims = D.assertClaimsArePublishableAndNeutral();
  const sourced = D.assertHeadlineFiguresAreSourced();
  const pairings = D.assertFiguresAreNotConflated();
  const figures = D.assertNoUnsourcedFigure();
  const ask = D.assertEndsOnOneAsk();
  D.assertCopyIsClean();
  D.assertNoPdfRequested(jobs, D.PDF_APPROVAL);

  fs.mkdirSync(OUT, { recursive: true });

  // The HTML stays alongside the PDFs. It is the readable-in-a-browser copy, and it is
  // what the folder held for as long as the no-PDF criterion was in force.
  const htmlPath = path.join(OUT, 'C35_OPENAI_MEETING_PACKAGE.html');
  fs.writeFileSync(htmlPath, bundleHtml, 'utf8');
  console.log(`  ${'C35_OPENAI_MEETING_PACKAGE.html'.padEnd(34)} `
    + `${(fs.statSync(htmlPath).size / 1024).toFixed(0)} KB`);

  for (const j of jobs) {
    const r = await renderPdf({ html: j.html, outPath: path.join(OUT, j.file),
      landscape: j.landscape, maxPages: j.maxPages, margin: j.margin });
    console.log(`  ${j.file.padEnd(34)} ${r.pages} page(s)`
      + `${j.maxPages ? ' (limit ' + j.maxPages + ')' : ''}  `
      + `${(r.bytes / 1024).toFixed(0)} KB`);
  }

  console.log('');
  for (const f of D.PUBLIC_FIGURES) {
    console.log(`  figure (${f.role.padEnd(7)})        : ${f.figure} ${f.population} `
      + `by ${f.by}`);
  }
  console.log('  headline figures sourced: ' + sourced + ', each traceable in EVIDENCE');
  console.log('  conflation guards       : ' + pairings
    + ' forbidden pairings, none present');
  console.log('  Anthropic terms screened: ' + terms + ', including the C3.3 contact names');
  console.log('  claims cited            : ' + claims.length
    + ', all publishable AND lab-neutral');
  console.log('  figures                 : ' + figures + ', every one sourced');
  console.log('  the ask                 : ' + ask.slice(0, 58) + '...');
  console.log('  PDFs                    : generated, approved ' + D.PDF_APPROVAL.on
    + ' by ' + D.PDF_APPROVAL.approvedBy);
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
