const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Wait for the WS badge to say "connected" before submitting anything.
  await page.waitForFunction(() => {
    const el = document.querySelector('.ws-badge');
    return el && el.textContent.includes('connected');
  }, { timeout: 10000 });

  await page.fill('#zip', '48201');
  await page.getByRole('checkbox', { name: 'Healthcare' }).check();
  await page.getByRole('checkbox', { name: 'Education' }).check();
  await page.getByRole('button', { name: 'Save My Preferences' }).click();

  // Wait for the real-time confirmation to appear (STORY-002: updates without reload).
  await page.waitForSelector('.confirmation', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/peace/Downloads/story002_003_step1_initial_preferences.png', fullPage: true });
  console.log('Captured step 1: initial preferences saved');

  // STORY-002's own acceptance example: change issues to Environment + Public Safety,
  // confirm the UI updates in real time without a page reload.
  await page.getByRole('checkbox', { name: 'Healthcare' }).uncheck();
  await page.getByRole('checkbox', { name: 'Education' }).uncheck();
  await page.getByRole('checkbox', { name: 'Environment' }).check();
  await page.getByRole('checkbox', { name: 'Public Safety' }).check();
  await page.getByRole('button', { name: 'Save My Preferences' }).click();

  await page.waitForFunction(() => {
    const el = document.querySelector('.confirmation');
    return el && el.textContent.includes('Environment') && el.textContent.includes('Public Safety');
  }, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/peace/Downloads/story002_003_step2_realtime_update.png', fullPage: true });
  console.log('Captured step 2: real-time preference change reflected without reload');

  await browser.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
