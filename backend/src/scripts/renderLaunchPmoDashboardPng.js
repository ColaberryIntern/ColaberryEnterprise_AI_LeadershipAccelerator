#!/usr/bin/env node
// Render the redesigned Launch Readiness Dashboard preview as a PNG. The
// PNG is what gets attached to the weekly BC Message Board comment so the
// team sees the polished design as-rendered, not BC's stripped-CSS version.
//
// Defaults to rendering tmp/launch-pmo-redesign-preview.html (Ali's review
// copy with today's hardcoded data). Production weekly post will swap to a
// freshly-rendered HTML from the live state.
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const REPO = path.resolve(__dirname, '../../..');
const HTML_IN = process.argv[2] || path.join(REPO, 'tmp/launch-pmo-redesign-preview.html');
const PNG_OUT = process.argv[3] || path.join(REPO, 'tmp/launch-pmo-dashboard-preview.png');

(async () => {
  const browser = await chromium.launch();
  // Render at a high logical width so the layout uses the desktop grid
  // (kpis 4 cols, area-grid 2 cols, feasibility full 4-col grid). 1280 is
  // the sweet spot — wider than 880 mobile breakpoint, narrower than the
  // 1140 container max so we don't waste pixels on side gutters.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('file:///' + HTML_IN.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  // Full-page screenshot captures every section scrolled together.
  await page.screenshot({ path: PNG_OUT, fullPage: true });
  await browser.close();
  console.log('PNG:', PNG_OUT, '(' + (fs.statSync(PNG_OUT).size / 1024).toFixed(1) + ' KB)');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
