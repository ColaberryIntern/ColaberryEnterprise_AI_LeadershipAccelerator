/**
 * Build C3.5's OpenAI meeting package. HTML ONLY.
 *
 *   node scripts/artifacts/buildC35Artifacts.js
 *
 * NO PDF IS GENERATED, AND THAT IS DELIBERATE. "PDF not generated before approval" is an
 * acceptance criterion on this ticket, so this script has no PDF path at all and asserts
 * that none of its jobs asks for one. It inverts the usual rule here, where every ticket
 * gets PDFs because Basecamp will not preview HTML.
 *
 * The assertion that matters is assertZeroAnthropicContent. The ticket calls leakage an
 * explicit failure condition, and it is the kind that is invisible on a reread: a sentence
 * written for the other lab survives because it is a good sentence. The guard imports the
 * contact names from C3.3 rather than restating them, so it cannot drift from the list it
 * protects against, and it bans two registry claims that are VERIFIED and perfectly
 * publishable everywhere else.
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c35Data');
const B = require('./tickets/c35Bundle');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.5');

async function main() {
  const jobs = [
    { file: 'C35_OPENAI_MEETING_PACKAGE.html', html: B.buildBundle() },
  ];

  const terms = D.assertZeroAnthropicContent();
  const claims = D.assertClaimsArePublishableAndNeutral();
  const figures = D.assertNoUnsourcedFigure();
  const ask = D.assertEndsOnOneAsk();
  D.assertCopyIsClean();
  D.assertNoPdfRequested(jobs);

  fs.mkdirSync(OUT, { recursive: true });
  for (const j of jobs) {
    const outPath = path.join(OUT, j.file);
    fs.writeFileSync(outPath, j.html, 'utf8');
    const bytes = fs.statSync(outPath).size;
    console.log(`  ${j.file.padEnd(36)} ${(bytes / 1024).toFixed(0)} KB`);
  }

  console.log('');
  console.log('  leading on              : the verified 300,000-by-2026 commitment');
  console.log('  refused figure          : "' + D.REFUSED_FIGURE.figure
    + '", in no source we hold');
  console.log('  Anthropic terms screened: ' + terms + ', including the C3.3 contact names');
  console.log('  claims cited            : ' + claims.length
    + ', all publishable AND lab-neutral');
  console.log('  figures                 : ' + figures + ', every one sourced');
  console.log('  the ask                 : ' + ask.slice(0, 58) + '...');
  console.log('  PDFs generated          : NONE, which is an acceptance criterion');
  console.log('');
  console.log('  REVIEW STATE: READY FOR ALI REVIEW - DOCUMENT');
  console.log('\nwritten to ' + OUT);
}

main().catch((e) => { console.error('BUILD FAILED: ' + e.message); process.exit(1); });
