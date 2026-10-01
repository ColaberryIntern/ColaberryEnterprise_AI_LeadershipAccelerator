'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });
const BASE = path.join(OUT_DIR, 'feature-4-student-staff-performance-evals');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login as Residence Director (id=1, Dr. Sarah Chen) — sees all evals + pending alert
  await page.goto('http://localhost:3000/login');
  await page.locator('input[name="user_id"][value="1"]').check();
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/');

  // 1. Evaluations list — shows all groups + pending alert
  await page.goto('http://localhost:3000/evaluations');
  await page.waitForSelector('.card', { timeout: 8000 });
  await page.screenshot({ path: `${BASE}.png`, fullPage: true });
  console.log('  ✓ evaluations list');

  // 2. Side-by-side comparison — Jake Thompson (id=4, has both self + supervisor)
  await page.goto('http://localhost:3000/evaluations/compare/4?period=Spring+2026');
  await page.waitForSelector('table', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-compare-side-by-side.png`, fullPage: true });
  console.log('  ✓ comparison view (side-by-side)');

  // 3. Individual evaluation detail (eval id=1 — Jake's self-eval)
  await page.goto('http://localhost:3000/evaluations/1');
  await page.waitForSelector('.card', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-detail-self-eval.png`, fullPage: true });
  console.log('  ✓ self-evaluation detail');

  // 4. New evaluation form (supervisor type)
  await page.goto('http://localhost:3000/evaluations/new?type=supervisor&evaluatee_id=5');
  await page.waitForSelector('form', { timeout: 6000 });
  await page.screenshot({ path: `${BASE}-new-supervisor-form.png`, fullPage: true });
  console.log('  ✓ new supervisor eval form');

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
