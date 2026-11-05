'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-6-student-360-profile-privacy-tiers');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── RD view (full access) ─────────────────────────────────────────────────
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Student list — RD sees all 4 buildings
  await page.goto('http://localhost:3000/students');
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}.png`, fullPage: true });
  console.log('  ✓ student list (RD — all buildings)');

  // 2. Alex Kim 360 profile — RD sees private notes + all incidents
  await page.goto('http://localhost:3000/students/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-rd-full-profile.png`, fullPage: true });
  console.log('  ✓ Alex Kim 360 profile (RD — full access, private note visible)');

  // ── CC view (coordinator — no private notes) ──────────────────────────────
  await page.goto('http://localhost:3000/logout', { method: 'POST' });
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="2"]').check(); // Marcus Williams CC
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 3. Alex Kim profile as CC — sees public notes only, no private RD note
  await page.goto('http://localhost:3000/students/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-cc-profile.png`, fullPage: true });
  console.log('  ✓ Alex Kim profile (CC — public notes only, private note hidden)');

  // ── SS view (basic profile only) ─────────────────────────────────────────
  await page.goto('http://localhost:3000/logout', { method: 'POST' });
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="4"]').check(); // Jake Thompson SS
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 4. Alex Kim profile as SS — locked access notice, no notes section
  await page.goto('http://localhost:3000/students/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-ss-limited.png`, fullPage: true });
  console.log('  ✓ Alex Kim profile (SS — limited view, no staff notes)');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
