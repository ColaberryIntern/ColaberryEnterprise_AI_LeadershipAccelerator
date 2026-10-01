'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'feature-2-staff-scheduling-on-call-rotation.png');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as Community Coordinator (user 4 = Marcus Webb) to see schedule + swap approvals
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="4"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // Navigate to schedule and screenshot weekly calendar
  await page.goto('http://localhost:3000/schedule');
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('  ✓ weekly calendar screenshot:', OUT);

  // Screenshot: shift detail with pending swap (shift that has a swap request)
  await page.goto('http://localhost:3000/schedule?week=2026-06-19');
  await page.waitForSelector('.card');
  const swapShiftLink = await page.locator('a[href^="/schedule/"]').first();
  if (swapShiftLink) {
    const href = await swapShiftLink.getAttribute('href');
    if (href && href !== '/schedule') {
      await page.goto(`http://localhost:3000${href}`);
      await page.waitForSelector('.card');
      await page.screenshot({
        path: OUT.replace('.png', '-shift-detail-swap.png'),
        fullPage: true,
      });
      console.log('  ✓ shift detail (swap request) screenshot');
    }
  }

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
