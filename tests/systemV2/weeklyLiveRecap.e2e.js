/**
 * weeklyLiveRecap.e2e.js: browser proof for the class recap page (Basecamp WL1.2).
 *
 * Raw Playwright driven by node, like every script in this directory:
 *     BASE_URL=https://enterprise.colaberry.ai PW_PATH=playwright node tests/systemV2/weeklyLiveRecap.e2e.js
 * Locally with Edge instead of a downloaded Chromium: add PW_CHANNEL=msedge.
 *
 * The API is intercepted (page.route), so the run needs only the deployed frontend and never reads
 * or writes a real attendee's recap. What it proves, in a real browser:
 *   1. With a token: the page renders the overview, the next-event button and the class chat.
 *   2. A STALE portal token in localStorage does not bounce the visitor to the login page
 *      (the 2026-11-23 check-in defect class: attendees from an email have no account).
 *   3. Without a token: overview only, chat locked.
 *   4. A missing recap shows "not available", never a login prompt.
 * It must be able to fail: a reachability preflight is itself a check, and every assertion that did
 * not evaluate counts as a failure. Exit 1 on any failure.
 */
const PW = require(process.env.PW_PATH || 'playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const RECAP = {
  title: 'Weekly Live Ep 2', date: 'Monday, November 30',
  summary: { headline: 'It Works While You Sleep', intro: 'Thanks for joining.', ideas: [{ icon: '', title: 'One skill, one job', text: 'Sort, draft, brief' }], steps: ['Sort', 'Draft', 'Brief'], quote: 'It drafts. You decide.', homework: 'Pick one overnight task' },
  nextEventUrl: 'https://www.eventbrite.com/e/123', personal: true,
  chat: [{ id: 'm1', kind: 'attendee', name: 'Ana', content: 'Can it run on my phone?', at: '2026-12-01T00:40:00Z' }],
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };

async function main() {
  const browser = await PW.chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // A stale portal token, exactly what a returning member's browser holds.
    await ctx.addInitScript(() => { try { localStorage.setItem('participant_token', 'stale.expired.token'); } catch (e) { /* storage blocked */ } });
    const page = await ctx.newPage();
    await page.route('**/api/live/recap/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith(`/api/live/recap/${SID}`)) {
        const personal = Boolean(url.searchParams.get('t'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...RECAP, personal, chat: personal ? RECAP.chat : null }) });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' });
    });
    // Any signed-in call the portal shell makes with the stale token gets the 401 it would get in production.
    await page.route('**/api/portal/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"expired"}' }));

    let reachable = false;
    try { const r = await page.goto(`${BASE}/portal/class-recap/${SID}?t=tok`, { waitUntil: 'domcontentloaded', timeout: 30000 }); reachable = Boolean(r && r.status() < 500); } catch (e) { check('reach the site', false, e.message); }
    check('reach the site', reachable, BASE);

    await page.waitForSelector('[data-testid="rcp-hero"]', { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(1500);
    check('with token: still on the recap page (no login bounce)', page.url().includes('/portal/class-recap/'), page.url());
    check('with token: overview headline', (await page.textContent('[data-testid="rcp-hero"]').catch(() => '') || '').includes('It Works While You Sleep'));
    check('with token: next-event button', (await page.getAttribute('[data-testid="rcp-next"]', 'href').catch(() => null)) === RECAP.nextEventUrl);
    check('with token: class chat shown', (await page.textContent('[data-testid="rcp-chat"]').catch(() => '') || '').includes('Can it run on my phone?'));

    await page.goto(`${BASE}/portal/class-recap/${SID}`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForSelector('[data-testid="rcp-hero"]', { timeout: 15000 }).catch(() => null);
    check('without token: overview still shown', (await page.$('[data-testid="rcp-hero"]')) !== null);
    check('without token: chat locked', (await page.$('[data-testid="rcp-chat-locked"]')) !== null && (await page.$('[data-testid="rcp-chat"]')) === null);

    await page.goto(`${BASE}/portal/class-recap/00000000-0000-4000-8000-000000000000`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForSelector('[data-testid="rcp-missing"]', { timeout: 15000 }).catch(() => null);
    const missingText = (await page.textContent('[data-testid="rcp-missing"]').catch(() => '')) || '';
    check('missing recap: says not available', missingText.includes('not available'));
    check('missing recap: no login bounce', page.url().includes('/portal/class-recap/'), page.url());
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('E2E FAILED: ' + e.message); process.exit(1); });
