#!/usr/bin/env node
/**
 * captureClassKitRedesign.js — one-off capture for the Class Kit panel
 * redesign (loop-architect run 20260731-195500-classkit-panel-redesign).
 * JWT minted on the prod VPS via SSH (no password needed), same pattern as
 * captureAdminOpsScreenshots.js.
 *
 * Usage: node scripts/captureClassKitRedesign.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require(path.resolve(__dirname, '../node_modules/sharp'));
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, '.loop-architect/runs/20260731-195500-classkit-panel-redesign/screenshots');
const BASE_URL = 'https://enterprise.colaberry.ai';
const COHORT_ID = '1f1d86f4-6da5-4767-a250-cd8310570bea';
const SESSION_ID = 'd9e121ce-8dbe-4fff-a066-d3753534342f'; // Week 2 · Architecture Day — Agent Skills
const MAX_SAFE_WIDTH = 1800;
const VIEWPORT = { width: 1440, height: 900 };

function mintJwt() {
  const inner = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('NO_SECRET'); process.exit(1); }
const token = jwt.sign({ sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' }, secret, { expiresIn: '2h' });
process.stdout.write(token);
`;
  const b64 = Buffer.from(inner).toString('base64');
  const cmd = `ssh root@95.216.199.47 "docker exec accelerator-backend sh -c 'echo ${b64} | base64 -d | node'"`;
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

async function downscaleIfNeeded(filePath) {
  const meta = await sharp(filePath).metadata();
  if ((meta.width || 0) <= MAX_SAFE_WIDTH) return;
  const buf = await sharp(filePath).resize({ width: MAX_SAFE_WIDTH, withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(filePath, buf);
}

async function shoot(page, name, opts = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  await downscaleIfNeeded(file);
  console.log(`[shot] ${name}.png`);
  return file;
}

(async () => {
  console.log('[init] minting JWT via prod ssh...');
  const token = mintJwt();
  if (!token || token.length < 40) throw new Error('JWT mint failed');
  console.log(`[init] JWT minted (${token.length} chars)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(({ t }) => {
    try { window.localStorage.setItem('admin_token', t); } catch (_) {}
  }, { t: token });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('[pageerror]', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.warn('[console:error]', msg.text()); });

  console.log('[load] /admin/accelerator');
  await page.goto(`${BASE_URL}/admin/accelerator`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(1500);

  console.log('[select] cohort');
  await page.selectOption('select[aria-label="Select cohort"]', COHORT_ID);
  await page.waitForTimeout(2000);

  console.log('[click] Sessions tab');
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.waitForTimeout(1500);
  await shoot(page, '01-accelerator-sessions-list');

  console.log('[find] Week 2 session row, open Present menu');
  const row = page.locator('tr', { hasText: 'Week 2 · Architecture Day' });
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.locator('button.dropdown-toggle-split').click();
  await page.waitForTimeout(500);

  console.log('[click] Customize');
  await row.getByText('⚙️ Customize').click();
  await page.waitForTimeout(2000);
  await shoot(page, '02-customize-modal-storybeats-collapsed');

  console.log('[expand] first Story Beats card');
  const firstCard = page.locator('.modal.show .card-header[role="button"]').first();
  if (await firstCard.count() > 0) {
    await firstCard.click();
    await page.waitForTimeout(600);
    await shoot(page, '03-customize-modal-storybeats-expanded');
  } else {
    console.warn('[warn] no collapsible card header found to expand');
  }

  console.log('[click] Timeline nav entry (should navigate to its own page + close modal)');
  await page.locator('.modal.show button', { hasText: 'Timeline' }).click();
  await page.waitForTimeout(2500);
  await shoot(page, '04-timeline-own-page', { fullPage: true });
  console.log('[url]', page.url());

  await browser.close();

  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'));
  console.log(`\n[done] ${files.length} screenshots in ${OUT_DIR}:`);
  files.sort().forEach((f) => console.log(`  - ${f}`));
})().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
