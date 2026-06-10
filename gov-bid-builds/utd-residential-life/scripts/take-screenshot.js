// One-shot Playwright screenshot of the forms-for-reporting feature demo flow.
// Run: node scripts/take-screenshot.js
// Requires: npx playwright install chromium (first time only)
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(
  __dirname, '..', 'docs', 'screenshots',
  'feature-1-forms-for-reporting-incident-noise-lockout-etc-.png'
);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Login as Residence Director (id=1)
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 2. Screenshot: Dashboard (shows stats + escalated report)
  await page.waitForSelector('.stat-number');
  await page.screenshot({ path: OUT.replace('.png', '-dashboard.png'), fullPage: true });
  console.log('  ✓ dashboard screenshot');

  // 3. Navigate to new noise complaint form
  await page.goto('http://localhost:3000/reports/new?type=noise_complaint');
  await page.waitForSelector('form[action="/reports"]');

  // Pre-fill the form for the screenshot
  await page.selectOption('select[name="building"]', 'Andrews Hall');
  await page.fill('input[name="room_number"]', '214');
  // Set occurred_at to a late-night time to show escalation rule
  await page.fill('#occurred_at_input', '2026-06-10T23:00');
  await page.selectOption('select[name="noise_type"]', 'party');
  await page.fill('textarea[name="description"]', 'Loud party in room 214 — music and shouting audible from two floors down. Resident was contacted but refused to comply.');

  // 4. Screenshot: filled-in noise complaint form (shows escalation warning)
  await page.screenshot({ path: OUT, fullPage: true });
  console.log('  ✓ form screenshot (main):', OUT);

  // 5. Submit and screenshot the resulting report detail (escalated)
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/reports\/\d+/);
  await page.waitForSelector('.badge.bg-danger');
  await page.screenshot({ path: OUT.replace('.png', '-report-detail.png'), fullPage: true });
  console.log('  ✓ report detail screenshot (escalated)');

  // 6. Screenshot: type selector grid
  await page.goto('http://localhost:3000/reports/new');
  await page.waitForSelector('.type-card');
  await page.screenshot({ path: OUT.replace('.png', '-type-selector.png'), fullPage: false });
  console.log('  ✓ type selector screenshot');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
