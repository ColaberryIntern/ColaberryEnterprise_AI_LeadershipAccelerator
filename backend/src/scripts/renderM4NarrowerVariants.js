#!/usr/bin/env node
// Build narrower-width V10 PDF variants for David. Ali: "Give David
// some not so wide ones as well just in case these are too wide - i
// think the height is just right."
//
// Approach: render M4 at narrower viewport widths so the natural
// content fills the narrower page cleanly (no excess whitespace).
// At narrower widths text wraps more, making the ad proportionally
// taller. Each PDF is sized to match the rendered aspect ratio so
// the ad fills the page edge to edge.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');

// Narrower render widths to give David options
const NARROWER_TARGETS = [
  { renderW: 1100, label: 'wide-narrow' },
  { renderW: 900,  label: 'medium' },
  { renderW: 700,  label: 'narrow' },
];

async function renderAtWidth(browser, renderW) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: Math.max(1600, renderW + 200), height: 1400 });
  await page.goto('file:///' + HTML_IN.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({ content: `
    .ad-mockup.m4 {
      aspect-ratio: auto !important;
      overflow: visible !important;
      height: auto !important;
      width: ${renderW}px !important;
      max-width: ${renderW}px !important;
      border: 1px solid #ddd !important;
      box-shadow: none !important;
    }
  ` });
  await page.waitForTimeout(300);
  const box = await page.locator('.ad-mockup.m4').boundingBox();
  const pngPath = path.join(REPO, `tmp/m4-v10-source-${renderW}.png`);
  await page.locator('.ad-mockup.m4').screenshot({ path: pngPath, scale: 'device' });
  console.log(`  ${renderW}px wide -> ${box.width.toFixed(0)} x ${box.height.toFixed(0)} px (aspect ${(box.width/box.height).toFixed(3)}:1) -> ${pngPath}`);
  await page.close();
  return { pngPath, w: box.width, h: box.height };
}

async function pdfFromPng(browser, pngPath, pageWidthIn, pageHeightIn, outPdf) {
  const pngB64 = fs.readFileSync(pngPath).toString('base64');
  const pageHtml = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: ${pageWidthIn}in ${pageHeightIn}in; margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .page { width: ${pageWidthIn}in; height: ${pageHeightIn}in; display: flex; align-items: stretch; justify-content: stretch; }
  .page img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style></head><body>
<div class="page"><img src="data:image/png;base64,${pngB64}" alt="M4"></div>
</body></html>`;
  const htmlOut = path.join(REPO, `tmp/m4-v10-page-${pageWidthIn}x${pageHeightIn}.html`);
  fs.writeFileSync(htmlOut, pageHtml);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('file:///' + htmlOut.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.pdf({
    path: outPdf,
    width: `${pageWidthIn}in`,
    height: `${pageHeightIn}in`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log(`  PDF: ${pageWidthIn}"x${pageHeightIn}" -> ${outPdf} (${(fs.statSync(outPdf).size / 1024).toFixed(1)} KB)`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  console.log('Rendering M4 source at narrower widths...');
  const sources = [];
  for (const t of NARROWER_TARGETS) {
    const s = await renderAtWidth(browser, t.renderW);
    sources.push({ ...t, ...s });
  }

  console.log('\nBuilding PDFs at natural aspect (no excess whitespace)...');
  // Target trim height stays ~4.5" per Ali. Calculate trim width per source aspect
  // to keep ad filling the page edge-to-edge. Add 0.125" bleed each side.
  for (const s of sources) {
    const trimH = 4.5; // px height div 96 px/in -> ideal; actual aspect rules
    const aspect = s.w / s.h; // e.g., 1300x584 = 2.227, 1100x... narrower
    const trimW = +(trimH * aspect).toFixed(3);
    const bleedW = trimW + 0.25;
    const bleedH = trimH + 0.25;
    const outPdf = path.join(REPO, `docs/m4-v10-${s.label}-${trimW}x${trimH}.pdf`);
    await pdfFromPng(browser, s.pngPath, bleedW, bleedH, outPdf);
  }

  await browser.close();
  console.log('\nDone.');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
