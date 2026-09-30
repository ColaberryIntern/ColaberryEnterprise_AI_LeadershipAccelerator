#!/usr/bin/env node
/**
 * captureWorkExplainedScreenshot.js — one-off verification capture for the
 * "Work, explained" Overview-tab timeline (PR #2760). Confirms it actually
 * renders on Reese's real page, following the exact same pattern as
 * captureAbacOverrideCardScreenshot.js and captureAdminOpsScreenshots.js.
 *
 * JWT minted on the prod VPS via SSH — never touches Ali's password.
 * READ-ONLY: navigates and screenshots only.
 *
 * Usage:
 *   node scripts/captureWorkExplainedScreenshot.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/screenshots/2026-09-21-reese-work-explained-verify');
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.addInitScript((t) => { window.localStorage.setItem('admin_token', t); }, token);
  const page = await context.newPage();

  console.log('[nav] agent detail page...');
  await page.goto(`${BASE_URL}/admin/agents/${REESE_AGENT_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('[click] Overview tab...');
  await page.getByText('Overview', { exact: true }).click();
  await page.waitForTimeout(1500);

  const bodyText = await page.textContent('body');
  const foundCard = bodyText.includes('Work, explained');
  const foundButton = bodyText.includes('View full decision journal');
  console.log(`[check] "Work, explained" present: ${foundCard}`);
  console.log(`[check] "View full decision journal" present: ${foundButton}`);

  const file = path.join(OUT_DIR, '01-overview-work-explained.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[shot] ${file}`);

  fs.writeFileSync(path.join(OUT_DIR, 'page-text.txt'), `foundCard=${foundCard}\nfoundButton=${foundButton}\n\n${bodyText}`);

  await browser.close();
  console.log('[done]');
})().catch((e) => { console.error('[fatal]', e); process.exit(1); });
