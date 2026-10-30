#!/usr/bin/env node
/**
 * captureL71SessionModal.js
 *
 * L7.1's acceptance criterion is a screenshot of the REAL screen, so this drives production:
 * the admin Accelerator page, Sessions tab, session modal open, showing the new
 * "Broadcast this class on Colaberry Live" checkbox.
 *
 * A CSS mockup is explicitly not acceptable for this repo, which is why this clicks through the
 * live surface rather than rendering the component in isolation.
 *
 * Auth: reads a short-lived super_admin JWT from scripts/.ali_jwt.txt (gitignored), minted
 * separately inside the backend container where JWT_SECRET lives. The token is never printed.
 *
 * Usage: node scripts/captureL71SessionModal.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../node_modules/playwright'));
const { safeScreenshot } = require(path.resolve(__dirname, './captureHelpers'));

const BASE_URL = 'https://enterprise.colaberry.ai';
const OUT_DIR = path.resolve(__dirname, '../docs/screenshots/2026-10-18-l71-session-occurrence');
const TOKEN_FILE = path.resolve(__dirname, './.ali_jwt.txt');

function readToken() {
  if (process.env.CAPTURE_TOKEN) return process.env.CAPTURE_TOKEN.trim();
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('[capture] No token. Mint one into scripts/.ali_jwt.txt first.');
    process.exit(1);
  }
  const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!t || t.split('.').length !== 3) {
    console.error('[capture] Token file does not contain a JWT (expected three dot-separated parts).');
    process.exit(1);
  }
  console.log(`[capture] token loaded (${t.length} chars, value not printed)`);
  return t;
}

async function main() {
  const token = readToken();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Preflight: ask the API directly whether this token is admin. A browser that is not
  // authenticated just redirects to /admin/login, which looks identical to a dozen other
  // problems — this turns that into a specific message before a browser is even launched.
  const me = await fetch(`${BASE_URL}/api/admin/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!me.ok) {
    console.error(`[capture] /api/admin/me -> ${me.status}. The token is not accepted as admin, so`);
    console.error('[capture] the capture would only ever reach the login screen. Stopping here.');
    process.exit(1);
  }
  const meBody = await me.json().catch(() => ({}));
  console.log(`[capture] authenticated as admin; sections=${(meBody.sections || []).length}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      // The admin surface reads admin_token; participant_token is the PORTAL key and is why
      // the first attempt landed on /admin/login.
      window.localStorage.setItem('admin_token', t);
      window.localStorage.setItem('participant_token', t);
    } catch (_e) { /* ignore */ }
  }, token);
  const page = await ctx.newPage();

  const results = [];
  try {
    await page.goto(`${BASE_URL}/admin/accelerator?tab=sessions`, { waitUntil: 'networkidle', timeout: 60000 });

    if (/\/portal\/login|\/login/.test(page.url())) {
      throw new Error(`redirected to login (${page.url()}) — the token is not being accepted`);
    }

    // The Sessions tab's action button. Deep-linking sets the tab, but the cohort list has to
    // load first, so wait for the button rather than assuming the tab rendered.
    const addBtn = page.getByRole('button', { name: /Add Session/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 45000 });

    results.push(await safeScreenshot(page, path.join(OUT_DIR, '01-sessions-tab.png'), { fullPage: false }));

    await addBtn.click();

    // The checkbox IS the change. Waiting on it rather than on the modal proves the deployed
    // bundle is the new one, not just that a modal opened.
    const checkbox = page.locator('#sessionLiveEnabled');
    await checkbox.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(400);

    results.push(await safeScreenshot(page, path.join(OUT_DIR, '02-session-modal-live-unchecked.png'), { fullPage: false }));

    await checkbox.check();
    await page.waitForTimeout(300);
    results.push(await safeScreenshot(page, path.join(OUT_DIR, '03-session-modal-live-checked.png'), { fullPage: false }));

    const labelText = await page.locator('label[for="sessionLiveEnabled"]').innerText();
    console.log(`[capture] label on the real screen: "${labelText.trim()}"`);
    console.log(`[capture] checkbox checked: ${await checkbox.isChecked()}`);
  } catch (err) {
    console.error(`[capture] FAILED: ${err.message}`);
    try {
      await safeScreenshot(page, path.join(OUT_DIR, '99-failure-state.png'), { fullPage: false });
      console.error('[capture] wrote 99-failure-state.png so the failure is inspectable');
    } catch (_e) { /* nothing more to do */ }
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log(`\n[capture] ${results.length} screenshots in ${OUT_DIR}`);
  results.forEach((r) => console.log(`  ${path.basename(r.path || '')} ${r.finalWidth || ''}px`));
}

main().catch((e) => { console.error(`[capture] FAILED: ${e.message}`); process.exit(1); });
