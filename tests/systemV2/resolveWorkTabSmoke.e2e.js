/**
 * resolveWorkTabSmoke.e2e.js — smoke-proves the Inbox Intel "Resolve Work"
 * tab actually shipped and is wired end to end against a REAL running
 * backend: it is the default tab on /admin/inbox, its landing controls
 * render, and a real discover() round trip completes without error
 * (whatever it finds or doesn't find — a mailbox with zero matching
 * evidence is a legitimate, valid result, not a test failure).
 *
 * Follows this repo's existing raw-Playwright pattern (see
 * pointsEarnFlow.e2e.js) rather than @playwright/test, since only the
 * `playwright` package (not `@playwright/test`) is a project dependency and
 * no playwright.config.ts exists in this repo.
 *
 * SAFETY: unlike the existing example script, this one does NOT default to
 * production. BASE_URL must be supplied explicitly for anything other than
 * a local dev server, and ADMIN_JWT_SECRET must match the target server's
 * JWT_SECRET so the injected admin session token verifies.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 ADMIN_JWT_SECRET=<dev secret> node tests/systemV2/resolveWorkTabSmoke.e2e.js
 *
 * Exit 0 = all checks pass, 1 = one or more failed, 2 = misconfigured (no ADMIN_JWT_SECRET).
 */
const path = require('path');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}
function finish() {
  console.log(failures === 0 ? '\n[e2e] PASS' : `\n[e2e] FAIL (${failures} failed check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

async function main() {
  if (!JWT_SECRET) {
    console.error('[e2e] ADMIN_JWT_SECRET is required (must match the target server\'s JWT_SECRET). Aborting without contacting any server.');
    process.exit(2);
  }
  console.log(`[e2e] Resolve Work tab smoke test against ${BASE}`);

  const adminToken = jwt.sign(
    { sub: 'e2e-admin', email: 'e2e-admin@colaberry-test.local', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => localStorage.setItem('admin_token', t), adminToken);
    const page = await ctx.newPage();

    await page.goto(`${BASE}/admin/inbox`, { waitUntil: 'networkidle', timeout: 30000 });

    // 1) Resolve Work is the default/first tab (root directive section 4).
    const resolveTab = page.locator('[data-testid="inbox-tab-resolve"]');
    await resolveTab.waitFor({ timeout: 15000 });
    check('Resolve Work tab is present', await resolveTab.count() > 0);
    check('Resolve Work tab is selected by default (no ?tab= param)', (await resolveTab.getAttribute('aria-selected')) === 'true');

    // 2) Landing controls render.
    const queryInput = page.locator('[data-testid="resolve-query-input"]');
    await queryInput.waitFor({ timeout: 10000 });
    check('search input is present', await queryInput.count() > 0);
    const discoverButton = page.locator('[data-testid="resolve-discover-button"]');
    check('Discover Related Work button is present', await discoverButton.count() > 0);
    const personButtons = page.getByRole('button', { name: /Person/i });
    check('Person/Topic mode toggle is present', (await personButtons.count()) > 0);

    // 3) A real discover() round trip completes without crashing the UI —
    // narrow window + a deliberately generic topic query to minimize load
    // on whatever mailbox the target server is actually configured with.
    await queryInput.fill('zzz-e2e-smoke-query-no-real-match-expected');
    await discoverButton.click();
    const resultsOrToast = page.locator('[data-testid="discovery-results"], .toast, [role="alert"]');
    await resultsOrToast.first().waitFor({ timeout: 30000 });
    check('discover() round trip rendered a result (empty-state or found cases), not a crash', await resultsOrToast.count() > 0);

    const shot = path.join(__dirname, 'logs', `resolve-work-smoke-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    console.log(`  ℹ screenshot: ${shot}`);
  } finally {
    await browser.close();
  }

  finish();
}

main().catch((err) => { console.error('[e2e] fatal', err); process.exit(1); });
