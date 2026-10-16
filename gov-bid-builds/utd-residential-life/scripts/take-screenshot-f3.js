'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-3-program-proposals-curriculum-mapping');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as Residence Director (id=1, Dr. Sarah Chen) to see full mgmt UI
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Proposals list — shows pending alert + all statuses
  await page.goto('http://localhost:3000/proposals');
  await page.waitForSelector('.list-group', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}.png`, fullPage: true });
  console.log('  ✓ proposals list:', `${BASE}.png`);

  // 2. Detail of an approved proposal
  await page.goto('http://localhost:3000/proposals/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-detail-approved.png`, fullPage: true });
  console.log('  ✓ proposal detail (approved)');

  // 3. Detail of a pending proposal — shows RD review form
  await page.goto('http://localhost:3000/proposals/3');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-detail-pending-review-form.png`, fullPage: true });
  console.log('  ✓ proposal detail (pending + review form)');

  // 4. New proposal form
  await page.goto('http://localhost:3000/proposals/new');
  await page.waitForSelector('form', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-new-form.png`, fullPage: true });
  console.log('  ✓ new proposal form');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
