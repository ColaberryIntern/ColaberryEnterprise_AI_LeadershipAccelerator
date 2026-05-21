/**
 * verifyDemoRevival — 2026-05-21.
 *
 * Verifies the revived "system preview while you wait" flow end-to-end:
 * first-run idea screen → "Build with AI" branch → repo URL → Start full
 * build → redirect to /portal/project/demo showing the live AI-org preview
 * while the Architect build runs. Screenshots each step.
 *
 * Run: RUN1_TOKEN=<token> node scripts/verifyDemoRevival.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { safeScreenshot } = require('./captureHelpers');

const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const TOKEN = process.env.RUN1_TOKEN;
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', '2026-05-21-demo-revival');
const IDEA = 'A small-business CRM that automatically tags incoming leads by industry, routes hot leads to a single account owner based on territory, and emails a weekly digest summarizing pipeline health, stalled deals, and conversion rate trends.';
const REPO = 'https://github.com/octocat/Hello-World';

(async () => {
  if (!TOKEN) { console.error('Set RUN1_TOKEN'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const jwt = (await (await fetch(`${BASE}/api/portal/verify?token=${TOKEN}`)).json()).jwt;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(t => { try { localStorage.setItem('participant_token', t); localStorage.removeItem('requirements_builder_state'); } catch (e) {} }, jwt);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  const log = (m) => console.log(`[verify] ${m}`);

  // 1. First-run home → idea screen
  await page.goto(`${BASE}/portal/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('textarea').first().fill(IDEA);
  await page.waitForTimeout(500);
  await safeScreenshot(page, path.join(OUT, 'revived-01-idea-with-build-with-ai.png'), { fullPage: true });
  const hasBtn = await page.getByRole('button', { name: /Build with AI/i }).count();
  log(`"Build with AI" button present: ${hasBtn > 0}`);

  // 2. Click Build with AI → repo input
  await page.getByRole('button', { name: /Build with AI/i }).click();
  await page.waitForTimeout(600);
  await page.getByPlaceholder(/github\.com\/your-org/i).fill(REPO);
  await page.waitForTimeout(300);
  await safeScreenshot(page, path.join(OUT, 'revived-02-repo-input.png'), { fullPage: true });

  // 3. Start full build → should POST architect-build + redirect to /demo
  await page.getByRole('button', { name: /Start full build/i }).click();
  // Wait for navigation to the demo page.
  await page.waitForFunction(() => location.pathname.includes('/portal/project/demo'), null, { timeout: 30000 });
  log(`redirected to: ${page.url()}`);
  // Let the scripted animation + build-preview load.
  await page.waitForTimeout(12000);
  await safeScreenshot(page, path.join(OUT, 'revived-03-demo-live-preview.png'), { fullPage: true });

  // 4. Confirm a build actually started (architect_slug set).
  const status = await (await fetch(`${BASE}/api/portal/project/architect-status`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
  log(`architect-status phase: ${status.phase}, progress: ${status.progress}`);

  console.log(`[verify] page errors: ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
