#!/usr/bin/env node
/**
 * captureAbacOverrideCardScreenshot.js — one-off verification capture for
 * Phase 3 of the shadow-to-enforcement mission. Confirms the new
 * "Authorization Enforcement" card (Agent Detail -> Performance & Settings
 * -> Authority & controls) actually renders on a real agent's page, closing
 * the gap the automated production-verifier's Playwright-less session left
 * (source-level evidence only, no rendered-page confirmation).
 *
 * JWT minted on the prod VPS via SSH, same pattern as
 * captureAdminOpsScreenshots.js — never touches Ali's password. READ-ONLY:
 * navigates and screenshots only. Never clicks a radio button or Save.
 *
 * Usage:
 *   node scripts/captureAbacOverrideCardScreenshot.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/screenshots/2026-09-20-reese-abac-override-verify');
const BASE_URL = 'https://enterprise.colaberry.ai';
const REESE_AGENT_ID = '97dfbdf4-0e5b-4d86-b060-f4087b61f311';

function mintJwt() {
  const inner = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('NO_SECRET'); process.exit(1); }
const token = jwt.sign({ sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' }, secret, { expiresIn: '30m' });
process.stdout.write(token);
`;
  const b64 = Buffer.from(inner).toString('base64');
  const cmd = `ssh root@95.216.199.47 "docker exec accelerator-backend sh -c 'echo ${b64} | base64 -d | node'"`;
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('[init] minting JWT via prod ssh...');
  const token = mintJwt();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((t) => { window.localStorage.setItem('admin_token', t); }, token);
  const page = await context.newPage();

  console.log('[nav] agent detail page...');
  await page.goto(`${BASE_URL}/admin/agents/${REESE_AGENT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('[click] Performance & Settings tab...');
  await page.getByText('Performance & Settings', { exact: true }).click();
  await page.waitForTimeout(800);

  console.log('[click] Authority & controls sub-tab...');
  await page.getByText('Authority & controls', { exact: true }).click();
  await page.waitForTimeout(1000);

  const bodyText = await page.textContent('body');
  const foundCard = bodyText.includes('Authorization Enforcement');
  const foundDefault = bodyText.includes('Following the platform-wide default');
  console.log(`[check] "Authorization Enforcement" present: ${foundCard}`);
  console.log(`[check] "Following the platform-wide default" present: ${foundDefault}`);

  const file = path.join(OUT_DIR, '01-authority-controls-tab.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[shot] ${file}`);

  fs.writeFileSync(
    path.join(OUT_DIR, 'page-text.txt'),
    `foundCard=${foundCard}\nfoundDefault=${foundDefault}\n\n${bodyText}`,
  );

  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('[fatal]', e); process.exit(1); });
