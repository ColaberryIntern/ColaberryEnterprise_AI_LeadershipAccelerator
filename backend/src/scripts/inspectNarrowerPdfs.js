#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
(async () => {
  const REPO = path.resolve(__dirname, '../../..');
  const browser = await chromium.launch();
  for (const [html, png, w, h] of [
    [path.join(REPO, 'tmp/m4-v10-page-7.188x4.75.html'), path.join(REPO, 'tmp/m4-v10-medium-debug.png'), 7.188*96, 4.75*96],
    [path.join(REPO, 'tmp/m4-v10-page-5.509x4.75.html'), path.join(REPO, 'tmp/m4-v10-narrow-debug.png'), 5.509*96, 4.75*96],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: Math.round(w), height: Math.round(h) }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto('file:///' + html.replace(/\\/g, '/'));
    await p.waitForLoadState('networkidle');
    await p.screenshot({ path: png, clip: { x: 0, y: 0, width: Math.round(w), height: Math.round(h) } });
    console.log(png, '(' + (fs.statSync(png).size/1024).toFixed(1) + ' KB)');
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
