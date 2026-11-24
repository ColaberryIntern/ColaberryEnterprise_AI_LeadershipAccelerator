const { chromium } = require('playwright');
const fs = require('fs');

const env = {};
fs.readFileSync(__dirname + '/.env', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});
const ADMIN_KEY = env.ADMIN_API_KEY;
const STEWARD_KEY = env.DATA_STEWARD_API_KEY;
const OUT = 'C:/Users/peace/Downloads/';

async function shot(page, name) {
  await page.screenshot({ path: OUT + name, fullPage: true });
  console.log('captured:', name);
}

async function enterAdminKey(page, key) {
  const input = page.locator('input[type="password"], input[placeholder*="key" i]').first();
  await input.fill(key);
  const btn = page.getByRole('button', { name: /submit|connect|load|view/i }).first();
  if (await btn.count()) await btn.click();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  // --- Resident-facing page ---
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.ws-badge')?.textContent.includes('connected'), { timeout: 10000 });
  await page.fill('#zip', '48201');
  await page.getByRole('checkbox', { name: 'Housing' }).check();
  await page.getByRole('button', { name: 'Save My Preferences' }).click();
  await page.waitForSelector('.confirmation', { timeout: 10000 });
  await page.waitForTimeout(600);

  // STORY-014: expand provenance trail on the first candidate card
  const provBtn = page.getByRole('button', { name: /why am i seeing this/i }).first();
  if (await provBtn.count()) {
    await provBtn.click();
    await page.waitForTimeout(600);
  }
  await shot(page, 'story014_provenance_trail_expanded.png');

  // STORY-016: toggle "notify me" subscribe on a candidate
  const notifyBtn = page.getByRole('button', { name: /notify me of updates/i }).first();
  if (await notifyBtn.count()) {
    await notifyBtn.click();
    await page.waitForTimeout(600);
  }
  await shot(page, 'story016_subscribe_toggle.png');

  // STORY-005 / STORY-022: submit feedback (general, then accessibility type)
  const feedbackType = page.locator('select').last();
  if (await feedbackType.count()) {
    await feedbackType.selectOption({ label: 'Accessibility' }).catch(() => {});
  }
  await page.locator('textarea').fill('The contrast on the notify button is hard to read on mobile.');
  await page.getByRole('button', { name: /submit feedback/i }).click();
  await page.waitForTimeout(1000);
  await shot(page, 'story005_022_feedback_submitted.png');

  // --- Admin dashboards ---
  const dashboards = [
    { path: '/admin/health', name: 'story025_system_health_dashboard.png', key: ADMIN_KEY },
    { path: '/admin/pending-approvals', name: 'story011_026_pending_approvals_dashboard.png', key: ADMIN_KEY },
    { path: '/admin/feedback', name: 'story022_admin_feedback_dashboard.png', key: ADMIN_KEY },
    { path: '/admin/governance', name: 'story013_029_governance_score_dashboard.png', key: ADMIN_KEY },
    { path: '/admin/recent-actions', name: 'story023_027_recent_actions_dashboard.png', key: STEWARD_KEY },
    { path: '/admin/anomalies', name: 'story028_032_anomalies_dashboard.png', key: STEWARD_KEY },
  ];

  for (const dash of dashboards) {
    await page.goto('http://localhost:5173' + dash.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await enterAdminKey(page, dash.key);
    await page.waitForTimeout(2500); // let the first WS push land
    await shot(page, dash.name);
  }

  // STORY-024 / STORY-031: access-denied state on a data_steward-gated page using the WRONG key
  await page.goto('http://localhost:5173/admin/recent-actions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await enterAdminKey(page, 'wrong-key-for-screenshot');
  await page.waitForTimeout(2000);
  await shot(page, 'story024_031_access_denied_wrong_key.png');

  await browser.close();
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
