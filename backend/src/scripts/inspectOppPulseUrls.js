#!/usr/bin/env node
// Login to Opp Pulse admin and discover the real URL patterns for:
//   - The strategic feed page
//   - A per-bid page
// So we can update the gov bids MB post with links that actually work.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const BASE = 'http://95.216.199.47';
const EMAIL = 'ali@colaberry.com';
const PASSWORD = process.env.PROD_ADMIN_PASSWORD;
if (!PASSWORD) { console.error('PROD_ADMIN_PASSWORD env var required'); process.exit(1); }

const OUT = path.resolve(__dirname, '../../../docs/screenshots/2026-06-01-opp-pulse-discovery');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  console.log('[1] Login...');
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, '01-login.png'), fullPage: true });
  // Try common login form selectors
  const emailSelectors = ['input[name="email"]', 'input[type="email"]', '#email', 'input[placeholder*="mail" i]'];
  const passSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
  let emailFilled = false;
  for (const s of emailSelectors) {
    if (await page.locator(s).count() > 0) { await page.fill(s, EMAIL); emailFilled = true; break; }
  }
  let passFilled = false;
  for (const s of passSelectors) {
    if (await page.locator(s).count() > 0) { await page.fill(s, PASSWORD); passFilled = true; break; }
  }
  console.log(`  email field: ${emailFilled}, password field: ${passFilled}`);
  // Submit
  const submitSelectors = ['button[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Log in")'];
  for (const s of submitSelectors) {
    if (await page.locator(s).count() > 0) { await page.click(s); break; }
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, '02-after-login.png'), fullPage: true });
  console.log(`  post-login URL: ${page.url()}`);

  // Try the strategic feed URL
  console.log('[2] Navigate to strategic feed...');
  for (const candidate of [`${BASE}/admin/bonfire/strategic`, `${BASE}/admin/strategic`, `${BASE}/admin/bonfire`]) {
    const r = await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    const status = r ? r.status() : null;
    console.log(`  ${candidate} -> ${status} (final: ${page.url()})`);
    await page.screenshot({ path: path.join(OUT, `03-strategic-${candidate.split('/').pop()}.png`), fullPage: true }).catch(() => {});
    if (status === 200) {
      // Inspect link patterns
      const linkPatterns = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('a[href]'));
        const interesting = all.filter(a => {
          const h = a.getAttribute('href') || '';
          return /bonfire|opportunit|admin/i.test(h) && h !== '/' && !h.startsWith('#');
        });
        // Sample 30 unique hrefs
        const uniq = [...new Set(interesting.map(a => a.getAttribute('href')))].slice(0, 30);
        return uniq;
      });
      console.log(`    found ${linkPatterns.length} bonfire/opp/admin-like links. Sample 10:`);
      for (const l of linkPatterns.slice(0, 10)) console.log(`      ${l}`);
      // Also look for known UUIDs from the cached data
      const knownUuids = ['7011f5af', 'e7743ce9'];
      const matchingLinks = linkPatterns.filter(h => knownUuids.some(u => h.includes(u)));
      if (matchingLinks.length) console.log(`    UUID-matching links: ${JSON.stringify(matchingLinks)}`);
      break;
    }
  }

  // Try clicking through to a specific bid page using known UUID
  console.log('[3] Try a known UUID directly...');
  const testUuid = '7011f5af'; // partial Harris County election - this is just a guess from the all-opps.json
  for (const candidate of [
    `${BASE}/admin/bonfire/${testUuid}`,
    `${BASE}/admin/bonfire/${testUuid}/submission-readiness`,
    `${BASE}/admin/bonfire/strategic/${testUuid}`,
  ]) {
    const r = await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
    const status = r ? r.status() : null;
    console.log(`  ${candidate} -> ${status} (final: ${page.url()})`);
    if (status === 200) {
      await page.screenshot({ path: path.join(OUT, `04-bid-${candidate.split('/').slice(-1)[0]}.png`), fullPage: true }).catch(() => {});
    }
  }

  await browser.close();
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
