#!/usr/bin/env node
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));
const HTML = path.resolve(__dirname, '../../../tmp/m4-pressready-7x4.5.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file:///' + HTML.replace(/\\/g, '/'));
  await page.waitForLoadState('networkidle');
  const wrapBox = await page.locator('.press-wrapper').boundingBox();
  const adBox = await page.locator('.ad-mockup.m4').boundingBox();
  console.log('press-wrapper:', JSON.stringify(wrapBox));
  console.log('ad-mockup:   ', JSON.stringify(adBox));
  const headlineSize = await page.locator('.m4-headline').evaluate(el => getComputedStyle(el).fontSize);
  const adAspect = await page.locator('.ad-mockup.m4').evaluate(el => getComputedStyle(el).aspectRatio);
  const adOverflow = await page.locator('.ad-mockup.m4').evaluate(el => getComputedStyle(el).overflow);
  const adHeight = await page.locator('.ad-mockup.m4').evaluate(el => getComputedStyle(el).height);
  console.log('headline font-size:', headlineSize);
  console.log('ad aspect-ratio:', adAspect);
  console.log('ad overflow:', adOverflow);
  console.log('ad computed height:', adHeight);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
