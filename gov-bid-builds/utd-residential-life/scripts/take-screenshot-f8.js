'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-8-student-of-concern-flag-workflow');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as RD (full access)
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Concerns list — RD view (all 3 flags, 2 active)
  await page.goto('http://localhost:3000/concerns');
  await page.waitForSelector('.card, .list-group-item', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}.png`, fullPage: true });
  console.log('  ✓ Concerns list — RD view (active flags)');

  // 2. All flags tab
  await page.goto('http://localhost:3000/concerns?status=all');
  await page.waitForSelector('.list-group-item', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-all.png`, fullPage: true });
  console.log('  ✓ Concerns list — all flags tab');

  // 3. Critical flag detail (Alex Kim — flag 1)
  await page.goto('http://localhost:3000/concerns/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-detail-critical.png`, fullPage: true });
  console.log('  ✓ Critical safety flag detail — Alex Kim');

  // 4. Resolved flag detail (Sam Taylor — flag 3)
  await page.goto('http://localhost:3000/concerns/3');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-resolved.png`, fullPage: true });
  console.log('  ✓ Resolved academic flag — Sam Taylor');

  // 5. New flag form (pre-filled for Maya Rivera, resident id 4)
  await page.goto('http://localhost:3000/concerns/new?resident_id=4');
  await page.waitForSelector('form', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-new-form.png`, fullPage: true });
  console.log('  ✓ New concern flag form');

  // 6. Student 360 profile with active concern alert + sidebar panel (Alex Kim)
  await page.goto('http://localhost:3000/students/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-student-profile-flagged.png`, fullPage: true });
  console.log('  ✓ Alex Kim 360 profile — active concern alert + sidebar flag history');

  // 7. SS view — Jake Thompson (can flag but sees limited notes)
  await page.goto('http://localhost:3000/logout', { method: 'POST' }).catch(() => {});
  await page.goto('http://localhost:3000/login');
  await page.waitForSelector('input[name="user_id"]', { timeout: 8000 });
  await page.locator('input[name="user_id"][value="4"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  await page.goto('http://localhost:3000/concerns');
  await page.waitForSelector('body', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-ss-view.png`, fullPage: true });
  console.log('  ✓ Concerns list — SS view (own flags only)');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
