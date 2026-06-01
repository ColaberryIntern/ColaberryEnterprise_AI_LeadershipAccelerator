#!/usr/bin/env node
// Headless verification of the Inbox COS digest-action fix.
// Walks: Show Me / Dismiss / Keep Holding and captures screenshots at each
// step + the destination of the "Open Admin Console" link to confirm the
// 404 path is gone.
const path = require('path');
const fs = require('fs');
const jwt = require(path.resolve(__dirname, '../../../node_modules/jsonwebtoken'));
const { chromium } = require(path.resolve(__dirname, '../../../node_modules/playwright'));

const JWT_SECRET = '97004a53b229259d75f702785aa34808efe8b9b6f4f653cf3e09cd91533d94f04b43b03689332671249c069d60e34cfcf137abe3b92473ffc730883772679c4c';
const BASE = 'https://enterprise.colaberry.ai';
const OUT = path.resolve(__dirname, '../../../docs/screenshots/2026-06-01-inbox-cos-fix');

const SHOW_ME_ID = 'a1198f3f-9219-40d5-8440-877df4a111b8';
const DISMISS_ID = '83a2ac61-dfd0-4a95-a1a6-53aaa640d98a';
const HOLD_ID = '05e58798-c4f3-428a-99dd-2d18b960e62b';

function makeToken(emailIds) {
  return jwt.sign({ batch_id: 'verify-' + Date.now(), email_ids: emailIds }, JWT_SECRET, { expiresIn: '24h' });
}

async function shot(page, label) {
  const p = path.join(OUT, `${label}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  -> ${label}.png (url: ${page.url()})`);
  return p;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 } });
  const results = [];

  // 1. SHOW ME: action=inbox - expect 302 redirect to /admin/inbox?tab=decisions&emailId=...
  console.log('[1] Show Me ...');
  {
    const token = makeToken([SHOW_ME_ID]);
    const url = `${BASE}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${SHOW_ME_ID}&action=inbox`;
    const page = await ctx.newPage();
    const responseChain = [];
    page.on('response', (r) => responseChain.push({ status: r.status(), url: r.url() }));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const finalUrl = page.url();
    const file = await shot(page, '01-show-me-landing');
    results.push({
      step: 'Show Me click',
      url,
      finalUrl,
      expected: 'should redirect to /admin/inbox?tab=decisions&emailId=...',
      ok: finalUrl.includes('/admin/inbox') && !finalUrl.includes('/admin/inbox/decisions'),
      responseChain,
      shot: file,
    });
    await page.close();
  }

  // 2. DISMISS: action=automation - expect Done! page
  console.log('[2] Dismiss ...');
  {
    const token = makeToken([DISMISS_ID]);
    const url = `${BASE}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${DISMISS_ID}&action=automation`;
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const file = await shot(page, '02-dismiss-done-page');
    // Capture the link target on the Done page
    const linkHref = await page.locator('a').first().getAttribute('href').catch(() => null);
    results.push({
      step: 'Dismiss click',
      url,
      finalUrl: page.url(),
      expected: 'Done! page with link to /admin/inbox (not /admin/inbox/decisions)',
      ok: linkHref === `${BASE}/admin/inbox`,
      linkHref,
      shot: file,
    });
    await page.close();
  }

  // 3. KEEP HOLDING: action=hold - expect Done! page
  console.log('[3] Keep Holding ...');
  {
    const token = makeToken([HOLD_ID]);
    const url = `${BASE}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${HOLD_ID}&action=hold`;
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const file = await shot(page, '03-hold-done-page');
    const linkHref = await page.locator('a').first().getAttribute('href').catch(() => null);
    results.push({
      step: 'Keep Holding click',
      url,
      finalUrl: page.url(),
      expected: 'Done! page with link to /admin/inbox',
      ok: linkHref === `${BASE}/admin/inbox`,
      linkHref,
      shot: file,
    });
    await page.close();
  }

  // 4. CLICK "Open Admin Console" from Dismiss Done page - should land on /admin/inbox (not 404)
  console.log('[4] Follow Open Admin Console link ...');
  {
    const token = makeToken([DISMISS_ID]);
    const url = `${BASE}/api/admin/inbox/digest-action?token=${encodeURIComponent(token)}&emailId=${DISMISS_ID}&action=automation`;
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Click the link
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/admin/inbox'), { timeout: 15000 }).catch(() => null),
      page.locator('a').first().click(),
    ]);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    const finalUrl = page.url();
    const file = await shot(page, '04-after-click-open-admin-console');
    const status = response ? response.status() : null;
    results.push({
      step: 'Click Open Admin Console',
      url,
      finalUrl,
      expected: 'lands on /admin/inbox - either page or login redirect, not 404',
      ok: !!finalUrl.includes('/admin/inbox') || (status && status !== 404),
      status,
      shot: file,
    });
    await page.close();
  }

  // 5. CONTROL: hit the old broken path directly to capture the 404 behavior
  console.log('[5] Control - direct hit on the old broken /admin/inbox/decisions path ...');
  {
    const page = await ctx.newPage();
    const resp = await page.goto(`${BASE}/admin/inbox/decisions`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => null);
    const file = await shot(page, '05-old-broken-path-control');
    results.push({
      step: 'Control: direct /admin/inbox/decisions',
      url: `${BASE}/admin/inbox/decisions`,
      finalUrl: page.url(),
      expected: 'the OLD route - shows whatever the SPA does for an unknown sub-route',
      ok: null,
      shot: file,
    });
    await page.close();
  }

  await browser.close();

  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results.map(r => ({ ...r, shot: path.basename(r.shot) })), null, 2));

  // Write a results.json next to the screenshots for the email builder
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results.map(r => ({ ...r, shot: path.basename(r.shot) })), null, 2));
  console.log(`\nResults: ${path.join(OUT, 'results.json')}`);
})().catch((e) => { console.error('FATAL:', e.stack || e.message); process.exit(1); });
