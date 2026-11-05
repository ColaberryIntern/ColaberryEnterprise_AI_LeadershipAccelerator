'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-7-insight-dashboards');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as RD (full access)
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Macro dashboard
  await page.goto('http://localhost:3000/insights');
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}-macro.png`, fullPage: true });
  console.log('  ✓ Insight macro dashboard (community overview + charts)');

  // 2. Andrews Hall drill-down
  await page.goto('http://localhost:3000/insights/hall/Andrews%20Hall');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-hall-andrews.png`, fullPage: true });
  console.log('  ✓ Andrews Hall drill-down (floor chart + program/staff panels)');

  // 3. Caruth Hall drill-down
  await page.goto('http://localhost:3000/insights/hall/Caruth%20Hall');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-hall-caruth.png`, fullPage: true });
  console.log('  ✓ Caruth Hall drill-down');

  // 4. Andrews Hall Floor 3 (Alex Kim rm320, Jordan Park rm320)
  await page.goto('http://localhost:3000/insights/hall/Andrews%20Hall/floor/3');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-floor-andrews-3.png`, fullPage: true });
  console.log('  ✓ Andrews Hall Floor 3 — resident cards + incidents');

  // 5. Andrews Hall Floor 2 (Logan Carter rm214)
  await page.goto('http://localhost:3000/insights/hall/Andrews%20Hall/floor/2');
  await page.waitForSelector('body', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-floor-andrews-2.png`, fullPage: true });
  console.log('  ✓ Andrews Hall Floor 2 — Logan Carter');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
