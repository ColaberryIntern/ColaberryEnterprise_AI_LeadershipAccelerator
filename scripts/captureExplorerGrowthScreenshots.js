/**
 * B006 — LOOK at the deployed Command Center.
 *
 * Green CI is not visual verification. A page can typecheck, build, deploy and
 * render nothing: this programme shipped a Projects card whose stylesheet its
 * own chunk never imported, and it looked correct to everyone who arrived from
 * a page that had already loaded the CSS.
 *
 * So this loads the REAL production page with a real admin token, walks all six
 * tabs, and — the one interaction that matters end to end — finds a decision
 * that actually has losers and opens its Why modal.
 *
 * Follows `captureAdminOpsScreenshots.js`, NOT `captureHelpers.createSafeContext`:
 * that helper seeds `participant_token`, while the admin axios instance reads
 * `admin_token` (`frontend/src/utils/api.ts:19`). Using the wrong one produces a
 * folder of login-page screenshots that all look like evidence.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const BASE_URL = 'https://enterprise.colaberry.ai';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', '2026-09-03-explorer-growth');
// 1800px ceiling, per the capture protocol's safe-width rule.
const VIEWPORT = { width: 1600, height: 1200 };

function mintJwt() {
  const inner = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { console.error('NO_SECRET'); process.exit(1); }
const token = jwt.sign({ sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' }, secret, { expiresIn: '6h' });
process.stdout.write(token);
`;
  const b64 = Buffer.from(inner).toString('base64');
  const cmd = `ssh root@95.216.199.47 "docker exec accelerator-backend sh -c 'echo ${b64} | base64 -d | node'"`;
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

const TABS = ['overview', 'journey', 'decisions', 'shadow', 'content', 'settings'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  console.log('[init] minting admin JWT via prod ssh...');
  const token = mintJwt();
  if (!token || token.length < 40) throw new Error('JWT mint failed');
  console.log(`[init] token minted (${token.length} chars)`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript(({ t }) => {
    try {
      window.localStorage.setItem('admin_token', t);
    } catch (_) {}
  }, { t: token });

  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const findings = [];

  for (const tab of TABS) {
    const url = `${BASE_URL}/admin/explorer-growth?tab=${tab}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    await page.waitForTimeout(1200);

    const body = await page.evaluate(() => document.body.innerText);

    // The check that matters: did it render the page, or a login screen, or a
    // spinner that never resolved? Each is a different failure and none of them
    // looks different in a screenshot thumbnail.
    const isLogin = /sign in|log in|password/i.test(body) && !/Explorer Growth OS/.test(body);
    const stillLoading = /Loading…/.test(body);
    const errored = /not missing, it is unknown/.test(body);

    findings.push({ tab, isLogin, stillLoading, errored, chars: body.length });

    await page.screenshot({ path: path.join(OUT, `${tab}.png`), fullPage: true });
    console.log(
      `[tab] ${tab.padEnd(10)} ${body.length} chars` +
        (isLogin ? '  !! LOGIN PAGE' : '') +
        (stillLoading ? '  !! STILL LOADING' : '') +
        (errored ? '  !! ERROR STATE' : ''),
    );
  }

  // ── The one interaction that matters ──────────────────────────────────────
  console.log('[why] opening a decision that actually has losers...');
  await page.goto(`${BASE_URL}/admin/explorer-growth?tab=decisions`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
  await page.waitForTimeout(1500);

  // The count badge on a Why button only renders when suppressed_count > 0, so
  // this finds a row with real losers rather than the first row on the page.
  const withLosers = page.locator('button:has-text("Why?") .badge').first();
  const found = (await withLosers.count()) > 0;

  let whyText = '';
  if (found) {
    await withLosers.click();
    await page.waitForTimeout(1500);
    whyText = await page.evaluate(() => {
      const m = document.querySelector('.modal.show');
      return m ? m.innerText : '';
    });
    await page.screenshot({ path: path.join(OUT, 'why-modal.png'), fullPage: true });
  }

  const losersRendered = (whyText.match(/lower priority|suppress|lost/gi) || []).length;
  console.log(`[why] modal opened: ${found}; chars: ${whyText.length}; loser-reason hits: ${losersRendered}`);
  console.log(`[why] "Why not the others" present: ${/Why not the others/.test(whyText)}`);

  fs.writeFileSync(
    path.join(OUT, 'findings.json'),
    JSON.stringify({ findings, whyOpened: found, whyChars: whyText.length, pageErrors, consoleErrors }, null, 2),
  );

  console.log(`\n[errors] pageerror: ${pageErrors.length}, console.error: ${consoleErrors.length}`);
  for (const e of pageErrors.slice(0, 5)) console.log('  pageerror:', e);
  for (const e of consoleErrors.slice(0, 5)) console.log('  console:', e);
  console.log(`\n[done] ${OUT}`);

  await browser.close();
})().catch((e) => {
  console.error('FATAL', e && e.message);
  process.exit(1);
});
