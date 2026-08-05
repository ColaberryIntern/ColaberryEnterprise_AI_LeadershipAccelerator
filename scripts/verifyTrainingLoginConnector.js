/**
 * verifyTrainingLoginConnector.js — validates the real student-facing login
 * path: training.colaberry.com -> click Login -> enterprise.colaberry.ai/portal/login
 * -> enter email -> request access link -> confirm success (not the
 * "pending admin approval" rejection).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const TEST_EMAIL = process.argv[2];
if (!TEST_EMAIL) {
  console.error('Usage: node scripts/verifyTrainingLoginConnector.js <email>');
  process.exit(1);
}

const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', `${new Date().toISOString().slice(0, 10)}-login-connector-verify`);

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await createSafeContext(browser, { token: null, label: 'safe' });
  const page = await ctx.newPage();
  const entries = [];

  try {
    await page.goto('https://training.colaberry.com', { waitUntil: 'networkidle', timeout: 30000 });
    const r1 = await safeScreenshot(page, path.join(OUT_DIR, '01-training-colaberry-home.png'), { fullPage: false });
    entries.push({ file: '01-training-colaberry-home.png', ...r1, note: 'training.colaberry.com landing page' });

    const loginLink = await page.$('a:has-text("Log In"), a:has-text("Login")');
    if (!loginLink) throw new Error('Login link not found on training.colaberry.com');
    const href = await loginLink.evaluate(el => el.getAttribute('href'));
    console.log('LOGIN_HREF=' + href);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
      loginLink.click(),
    ]);
    console.log('LANDED_ON=' + page.url());

    await page.fill('input[type="email"]', TEST_EMAIL);
    const r2 = await safeScreenshot(page, path.join(OUT_DIR, '02-portal-login-filled.png'), { fullPage: false });
    entries.push({ file: '02-portal-login-filled.png', ...r2, note: 'Portal login page, email filled in' });

    await page.click('button:has-text("Send me an access link")');
    await page.waitForTimeout(1500);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const rejected = /pending admin approval/i.test(bodyText);
    console.log('REJECTED_PENDING_APPROVAL=' + rejected);

    const r3 = await safeScreenshot(page, path.join(OUT_DIR, '03-portal-login-result.png'), { fullPage: false });
    entries.push({ file: '03-portal-login-result.png', ...r3, note: `Result after submit. Rejected as pending approval: ${rejected}` });

    fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify({
      test_email: TEST_EMAIL,
      login_href: href,
      landed_on: 'enterprise.colaberry.ai/portal/login',
      rejected_pending_approval: rejected,
      body_snippet: bodyText.slice(0, 300),
      tested_at: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('VERIFY_ERROR: ' + err.message);
    const rErr = await safeScreenshot(page, path.join(OUT_DIR, '99-error-state.png'), { fullPage: true }).catch(() => null);
    if (rErr) entries.push({ file: '99-error-state.png', ...rErr, note: 'Captured on error: ' + err.message });
  } finally {
    writeCaptureSummary(OUT_DIR, entries);
    await browser.close();
  }
})();
