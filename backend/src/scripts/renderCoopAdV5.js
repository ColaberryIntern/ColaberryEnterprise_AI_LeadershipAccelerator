#!/usr/bin/env node
// Render M4 V5 outputs: PDF of the full multi-mockup doc + PNG thumbnail of
// just the M4 mockup (used as the inline image in David's reply).
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.html');
const PDF_OUT = path.join(REPO, 'docs/coop-ad-mockups-2026-06-02.pdf');
const M4_PNG = path.join(REPO, 'tmp/mockup-thumb-4.png');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1800 } });
  const page = await ctx.newPage();
  await page.goto('file:///' + HTML.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');

  // PDF: print the whole doc
  await page.pdf({
    path: PDF_OUT,
    format: 'Letter',
    landscape: false,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    printBackground: true,
  });
  console.log('PDF:', PDF_OUT, '(' + (fs.statSync(PDF_OUT).size / 1024).toFixed(1) + ' KB)');

  // M4 thumb: screenshot the M4 mockup element only
  const m4 = await page.$('.ad-mockup.m4.m4-v5');
  if (m4) {
    await m4.screenshot({ path: M4_PNG });
    console.log('M4 thumb:', M4_PNG, '(' + (fs.statSync(M4_PNG).size / 1024).toFixed(1) + ' KB)');
  } else {
    console.warn('M4 element not found');
  }

  await browser.close();
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
