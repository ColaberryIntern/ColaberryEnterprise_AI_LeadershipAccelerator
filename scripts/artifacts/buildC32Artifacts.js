/**
 * Build C3.2's meeting package. HTML ONLY.
 *
 * C3.2's acceptance criteria include "PDF not generated before approval", so this entrypoint
 * deliberately does not call renderPdf. That is a departure from the standing two-PDF artifact
 * rule, and it is the ticket's departure rather than mine. Once Ali approves, the same bundle
 * can be rendered to PDF with renderArtifactPdf.
 *
 *   node scripts/artifacts/buildC32Artifacts.js
 */
const fs = require('fs');
const path = require('path');
const D = require('./tickets/c32Data');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'C3.2');
const NAME = 'C32_ANTHROPIC_MEETING_PACKAGE.html';

function main() {
  // Each of these throws rather than warning; a bundle that fails a criterion is not written.
  const cited = D.assertRegistryGated();
  const ask = D.assertOneAsk();

  const html = require('./tickets/c32Bundle').build();
  const openai = D.assertNoOpenAI(html);

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, NAME), html);

  console.log(NAME + '  ' + (html.length / 1024).toFixed(0) + ' KB');
  console.log('  registry-gated claims : ' + cited.length + '  ' + cited.join(' '));
  console.log('  single ask            : slide ' + ask.n + ', "' + ask.title + '"');
  console.log('  OpenAI mentions       : ' + openai.hits + ' found, ' + openai.allowed
    + ' allowed by CLM-025');
  console.log('  PDF generated         : no, by design (acceptance criterion)');
  console.log('\nwritten to ' + OUT);
}

try {
  main();
} catch (e) {
  console.error('BUILD FAILED: ' + e.message);
  process.exit(1);
}
