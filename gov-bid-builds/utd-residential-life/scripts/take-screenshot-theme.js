'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'theme-utd-branding');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as RD
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Dashboard — shows navbar + sidebar + footer
  await page.goto('http://localhost:3000/');
  await page.waitForSelector('.app-nav', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}-dashboard.png`, fullPage: true });
  console.log('  ✓ Dashboard — UTD Comet Blue navbar + orange accent + footer');

  // 2. Concerns list — another full page to confirm footer on every screen
  await page.goto('http://localhost:3000/concerns');
  await page.waitForSelector('.card, .list-group-item', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-concerns.png`, fullPage: true });
  console.log('  ✓ Concerns — footer + branding consistent');

  // 3. Login page — footer visible on unauthenticated pages too
  await page.goto('http://localhost:3000/logout', { method: 'POST' }).catch(() => {});
  await page.goto('http://localhost:3000/login');
  await page.waitForSelector('.login-card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-login.png`, fullPage: true });
  console.log('  ✓ Login page — footer + UTD branding');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
