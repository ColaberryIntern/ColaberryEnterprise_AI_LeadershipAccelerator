#!/usr/bin/env node
// Render the EMBEDDED-PNG page HTML to a PNG so we can see exactly what
// the PDF looks like (letterboxing, scale, etc).
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = path.join(REPO, 'tmp/m4-v10-7x4.5-page.html');
const PNG_OUT = path.join(REPO, 'tmp/m4-v10-7x4.5-debug.png');

(async () => {
  const browser = await chromium.launch();
  const PAGE_W_PX = 7.25 * 96;
  const PAGE_H_PX = 4.75 * 96;
  const ctx = await browser.newContext({ viewport: { width: PAGE_W_PX, height: PAGE_H_PX }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('file:///' + HTML_IN.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: PNG_OUT, clip: { x: 0, y: 0, width: PAGE_W_PX, height: PAGE_H_PX } });
  console.log('PNG:', PNG_OUT, '(' + (fs.statSync(PNG_OUT).size / 1024).toFixed(1) + ' KB)');
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
