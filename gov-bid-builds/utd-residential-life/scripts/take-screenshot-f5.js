'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-5-mass-communications-hub');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as RD Dr. Sarah Chen (id=1) — sees all broadcasts, can manage
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Communications hub — broadcasts + surveys
  await page.goto('http://localhost:3000/communications');
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}.png`, fullPage: true });
  console.log('  ✓ communications hub');

  // 2. New broadcast form
  await page.goto('http://localhost:3000/communications/new');
  await page.waitForSelector('form', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-new-broadcast.png`, fullPage: true });
  console.log('  ✓ new broadcast form');

  // 3. Survey detail with results (End-of-Year survey, id=1)
  await page.goto('http://localhost:3000/communications/surveys/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-survey-results.png`, fullPage: true });
  console.log('  ✓ survey detail with results');

  // 4. New survey builder form
  await page.goto('http://localhost:3000/communications/surveys/new');
  await page.waitForSelector('form', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-survey-builder.png`, fullPage: true });
  console.log('  ✓ survey builder');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
