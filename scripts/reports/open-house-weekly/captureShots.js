#!/usr/bin/env node
/**
 * C123: capture the two public pages a visitor sees (ad landing page, Open House form) at phone size, for the report's
 * "What the visitor sees" panel. Run locally:
 *
 *   ARTIFACT_CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe" node captureShots.js <out dir>
 *
 * Every /api/ call, pixel and analytics request is BLOCKED, so this capture never counts as a visitor in the funnel it
 * reports on. Nothing is submitted. Images are viewport-only (no full-page shots), 390x844 at 2x, about 300 KB each.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', '..', '..', 'node_modules', 'playwright'));

const PAGES = [
  ['lp.png', 'https://www.refactored.ai/lp/colaberry-training/ai-learning-platform'],
  ['form.png', 'https://www.refactored.ai/open-house'],
];
// The pages fill in the session date from GET /api/v1/open-house/event, a read with no tracking, so it is allowed.
const ALLOW = /\/api\/v1\/open-house\/event(\?|$)/;
const BLOCK = /\/api\/|facebook|fbcdn|google-analytics|googletagmanager|doubleclick|clarity\.ms|hotjar/i;

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('usage: node captureShots.js <out dir>'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.ARTIFACT_CHROMIUM || undefined });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('**/*', (r) => (BLOCK.test(r.request().url()) && !(ALLOW.test(r.request().url()) && r.request().method() === 'GET') ? r.abort() : r.continue()));
    for (const [file, url] of PAGES) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForTimeout(3000));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(out, file) });
      console.log('SHOT', file, (fs.statSync(path.join(out, file)).size / 1024).toFixed(0) + ' KB');
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
