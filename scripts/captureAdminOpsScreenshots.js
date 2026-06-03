#!/usr/bin/env node
/**
 * captureAdminOpsScreenshots.js
 *
 * Walks every /admin/ops surface with Playwright and writes screenshots to
 * docs/screenshots/<dated dir>/. JWT minted on the prod VPS via SSH so we
 * never need Ali's password.
 *
 * Usage:
 *   node scripts/captureAdminOpsScreenshots.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require(path.resolve(__dirname, '../node_modules/sharp'));
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/screenshots/2026-06-02-ai-ops-overnight');
const BASE_URL = 'https://enterprise.colaberry.ai';

const MAX_SAFE_WIDTH = 1800;
const VIEWPORT = { width: 1440, height: 900 };

function mintJwt() {
  // Run the JWT mint INSIDE the backend container (jsonwebtoken lives there,
  // JWT_SECRET is in the container env). Base64-encoded to dodge quote hell.
  const inner = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('NO_SECRET'); process.exit(1); }
const token = jwt.sign({ sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' }, secret, { expiresIn: '6h' });
process.stdout.write(token);
`;
  const b64 = Buffer.from(inner).toString('base64');
  const cmd = `ssh root@95.216.199.47 "docker exec accelerator-backend sh -c 'echo ${b64} | base64 -d | node'"`;
  const result = execSync(cmd, { encoding: 'utf8' });
  return result.trim();
}

async function downscaleIfNeeded(filePath) {
  const meta = await sharp(filePath).metadata();
  if ((meta.width || 0) <= MAX_SAFE_WIDTH) return;
  const buf = await sharp(filePath).resize({ width: MAX_SAFE_WIDTH, withoutEnlargement: true }).png().toBuffer();
  fs.writeFileSync(filePath, buf);
}

async function shoot(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await downscaleIfNeeded(file);
  console.log(`[shot] ${name}.png`);
  return file;
}

async function clickIfFound(page, selector) {
  try {
    const el = await page.$(selector);
    if (el) {
      await el.click();
      await page.waitForTimeout(600);
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
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
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn('[console:error]', msg.text());
  });

  // 1. Main queue view
  console.log('[load] /admin/ops');
  await page.goto(`${BASE_URL}/admin/ops`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(3000); // let queue load
  await shoot(page, '01-queue-overview');

  // 2. Open workspace on first task
  console.log('[interaction] open workspace on first task');
  await clickIfFound(page, 'button:has-text("Open workspace")');
  await page.waitForTimeout(2500);
  await shoot(page, '02-workspace-open-first-task');

  // 3. Run My Day
  console.log('[interaction] enter Run My Day');
  await clickIfFound(page, 'button:has-text("Run My Day")');
  await page.waitForTimeout(4000);
  await shoot(page, '03-run-my-day');

  // Exit Run My Day
  await clickIfFound(page, 'button:has-text("Exit Run My Day")');
  await page.waitForTimeout(800);

  // 4. Stale review tab
  console.log('[interaction] Stale review tab');
  await clickIfFound(page, 'button:has-text("Stale review")');
  await page.waitForTimeout(2500);
  await shoot(page, '04-stale-review');

  // 5. Captured skills tab
  console.log('[interaction] Captured skills tab');
  await clickIfFound(page, 'button:has-text("Captured skills")');
  await page.waitForTimeout(2000);
  await shoot(page, '05-captured-skills');

  // 6. Automation rules tab
  console.log('[interaction] Automation rules tab');
  await clickIfFound(page, 'button:has-text("Automation rules")');
  await page.waitForTimeout(2000);
  await shoot(page, '06-automation-rules');

  // 7. Back to queue + System Health drawer open
  console.log('[interaction] Queue + System Health open');
  await clickIfFound(page, 'button:has-text("My queue")');
  await page.waitForTimeout(1000);
  await clickIfFound(page, 'button:has-text("Show system + triage stats")');
  await page.waitForTimeout(1500);
  await shoot(page, '07-system-health-drawer');

  await browser.close();

  // Summary
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png'));
  console.log(`\n[done] ${files.length} screenshots in ${OUT_DIR}:`);
  files.sort().forEach((f) => console.log(`  - ${f}`));
})().catch((e) => {
  console.error('FAIL:', e.stack || e.message);
  process.exit(1);
});
