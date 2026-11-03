/**
 * Build ADS-1's one-page visual and its completion document.
 *
 * The visual is capped at one page and renderPdf enforces that by counting /Type /Page in the
 * rendered bytes, because a one-page design silently becoming two is the failure this pipeline
 * exists to catch. Passing the height check is NOT the same as the page being right - render it
 * to PNG and look at it before posting.
 */

const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/ads1Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'ADS-1');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'ADS1_AD_SPEND_LEDGER_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'ADS1_AD_SPEND_LEDGER_COMPLETION.pdf'),
  });
  console.log(`visual    ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB`);
  console.log(`document  ${d.pages} page(s)           ${(d.bytes / 1024).toFixed(0)} KB`);
  console.log(`out: ${OUT}`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
