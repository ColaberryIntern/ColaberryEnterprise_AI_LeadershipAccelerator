#!/usr/bin/env node
/**
 * One-off, R8 production verification screenshot for Reese Product Phase 1.
 * Walks Reese's real Agent Detail page (Overview tab) and captures the new
 * "Employee facts" card: availability, work state, last meaningful action,
 * charter version, manager chain ("Reports to: Ali"), behaviour switches.
 * JWT minted on the prod VPS via SSH, same pattern as
 * captureAdminOpsScreenshots.js.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs/screenshots/2026-09-18-reese-phase1-deploy');
const BASE_URL = 'https://www.refactored.ai';
const REESE_AGENT_ID = '97dfbdf4-0e5b-4d86-b060-f4087b61f311';

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

async function shoot(page, name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[shot] ${name}.png`);
  return file;
}

(async () => {
  console.log('[init] minting JWT via prod ssh...');
  const token = mintJwt();
  if (!token || token.length < 40) throw new Error('JWT mint failed');
  console.log(`[init] JWT minted (${token.length} chars)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
  await ctx.addInitScript(({ t }) => {
    try { window.localStorage.setItem('admin_token', t); } catch (_) {}
  }, { t: token });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('[pageerror]', e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.warn('[console:error]', msg.text()); });

  console.log(`[load] /admin/agents/${REESE_AGENT_ID}`);
  await page.goto(`${BASE_URL}/admin/agents/${REESE_AGENT_ID}`, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shoot(page, '01-agent-detail-glance');

  console.log('[interaction] Overview tab');
  const overviewTab = await page.$('button[role="tab"]:has-text("Overview")');
  if (overviewTab) {
    await overviewTab.click();
    await page.waitForTimeout(2000);
  } else {
    console.warn('[warn] Overview tab button not found by that selector');
  }
  await shoot(page, '02-agent-detail-overview-employee-facts');

  // Print the actually-rendered "Employee facts" text for the record.
  const bodyText = await page.textContent('body');
  const hasSection = bodyText && bodyText.includes('Employee facts');
  const hasReportsToAli = bodyText && /Reports to:\s*Ali/i.test(bodyText);
  const hasVersion2 = bodyText && bodyText.includes('v2');
  console.log(JSON.stringify({ hasEmployeeFactsSection: hasSection, hasReportsToAli, hasVersion2Text: hasVersion2 }));

  await browser.close();
  console.log(`\n[done] screenshots in ${OUT_DIR}`);
})().catch((e) => {
  console.error('[fatal]', e.message);
  process.exit(1);
});
