/**
 * Build ADS-3's one-page visual and its verification document.
 *
 * The visual is capped at one page and renderPdf enforces that by counting /Type /Page in the
 * rendered bytes. Passing the page check is NOT the same as the page being right - ADS-1's first
 * render fit the page and was unreadable at 9px. Render it to PNG and look at it before posting.
 */

const path = require('path');
const { renderPdf } = require('./renderArtifactPdf');
const R = require('./tickets/ads3Render');

const OUT = path.join(__dirname, '..', '..', 'docs', 'artifacts', 'ADS-3');

async function main() {
  const v = await renderPdf({
    html: R.buildVisual(),
    outPath: path.join(OUT, 'ADS3_ATTRIBUTION_HANDOFF_1PAGE.pdf'),
    landscape: true,
    maxPages: 1,
  });
  const d = await renderPdf({
    html: R.buildDocument(),
    outPath: path.join(OUT, 'ADS3_ATTRIBUTION_HANDOFF_VERIFICATION.pdf'),
  });
  console.log(`visual    ${v.pages} page(s) (limit 1)  ${(v.bytes / 1024).toFixed(0)} KB`);
  console.log(`document  ${d.pages} page(s)           ${(d.bytes / 1024).toFixed(0)} KB`);
  console.log(`out: ${OUT}`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
