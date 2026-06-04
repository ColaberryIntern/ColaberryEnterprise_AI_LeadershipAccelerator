#!/usr/bin/env node
// Render M4 V9 to press-ready PDFs via PNG-embedding. Sidesteps the
// aspect-ratio + overflow:hidden conflict in the multi-mockup CSS that
// was clipping V8+V9 added content at smaller render widths.
//
// Strategy:
//  1. Open the multi-mockup HTML in Playwright at a wide viewport (1600px)
//  2. Inject CSS to kill .ad-mockup's aspect-ratio + overflow constraints
//     so the FULL content renders without clip
//  3. Set .ad-mockup width explicitly so it lays out at a known size
//  4. Screenshot the .ad-mockup.m4 element at 3x device-scale for sharpness
//  5. For each target trim size, wrap that PNG in an HTML page sized to the
//     trim (bleed) and print to PDF
//
// Usage:
//   node renderM4ViaPng.js            # builds all 3 trim variants + thumb
//   node renderM4ViaPng.js 7 4.5 0.125 docs/m4-v10-7x4.5.pdf  # single
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const M4_PNG = path.join(REPO, 'tmp/m4-v10-source.png');

// V11: David won't pick. Lock to canonical NRECA RE Magazine half-page
// horizontal: 7" x 4.5" trim with 0.125" bleed each side -> 7.25" x 4.75"
// page. Bleed-out (no border, ad extends to page edge).
const DEFAULT_VARIANTS = [
  { w: 7, h: 4.5, bleed: 0.125, out: 'docs/m4-v11-press-ready.pdf', label: 'canonical-bleed-out' },
];

async function renderM4Source(browser) {
  const page = await browser.newPage();
  // Wide viewport: at this width the M4 content + aspect-ratio:1.54 box
  // are close to natural content height, minimizing the override
  // needed. 3x scale for sharp print output.
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('file:///' + HTML_IN.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');

  // Kill the aspect-ratio + overflow:hidden so all content renders
  await page.addStyleTag({ content: `
    .ad-mockup.m4 {
      aspect-ratio: auto !important;
      overflow: visible !important;
      height: auto !important;
      width: 900px !important;
      max-width: 900px !important;
      border: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .ad-mockup-shell:has(> .ad-mockup.m4) {
      max-width: 900px !important;
      aspect-ratio: auto !important;
    }
  ` });
  await page.waitForTimeout(300);

  const box = await page.locator('.ad-mockup.m4').boundingBox();
  console.log(`  Source M4 size: ${box.width.toFixed(0)} x ${box.height.toFixed(0)} px (aspect ${(box.width/box.height).toFixed(3)}:1)`);
  await page.locator('.ad-mockup.m4').screenshot({ path: M4_PNG, scale: 'device' });
  console.log(`  Source PNG: ${M4_PNG} (${(fs.statSync(M4_PNG).size / 1024).toFixed(1)} KB)`);
  await page.close();
  return { width: box.width, height: box.height };
}

async function renderPdfWithEmbeddedPng(browser, variant) {
  const { w, h, bleed, out, label } = variant;
  const pageW = w + 2 * bleed;
  const pageH = h + 2 * bleed;
  const pngB64 = fs.readFileSync(M4_PNG).toString('base64');

  // V11: ad bleeds edge-to-edge (no border, no inset). object-fit: cover lets
  // the embedded PNG fill the full page including bleed; critical content is
  // designed to stay inside the trim area.
  const pageHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: ${pageW}in ${pageH}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .page { width: ${pageW}in; height: ${pageH}in; display: block; }
  .page img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
</head><body>
<div class="page"><img src="data:image/png;base64,${pngB64}" alt="M4"></div>
</body></html>`;

  const htmlOut = path.join(REPO, `tmp/m4-v10-${w}x${h}-page.html`);
  fs.writeFileSync(htmlOut, pageHtml);

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('file:///' + htmlOut.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  const pdfPath = path.resolve(REPO, out);
  await page.pdf({
    path: pdfPath,
    width: `${pageW}in`,
    height: `${pageH}in`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log(`  ${w}"x${h}" trim (${pageW}"x${pageH}" bleed) [${label}]: ${pdfPath} (${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB)`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();

  console.log('Step 1: Render M4 source PNG at wide viewport...');
  await renderM4Source(browser);

  const args = process.argv.slice(2);
  const variants = (args.length === 4)
    ? [{ w: parseFloat(args[0]), h: parseFloat(args[1]), bleed: parseFloat(args[2]), out: args[3], label: 'custom' }]
    : DEFAULT_VARIANTS;

  console.log(`\nStep 2: Render ${variants.length} PDF variant(s) from the source PNG...`);
  for (const v of variants) {
    await renderPdfWithEmbeddedPng(browser, v);
  }

  await browser.close();
  console.log('\nDone.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
