/**
 * Colaberry Campus e2e (C11): every audience, against a LOCAL stack only. Never production.
 *
 * Proves section 7 of the build prompt in a real browser: the portal opens on the campus for each audience; every building
 * opens its real page with the banner; presence and the staff desks answer; the tour runs (member, Explorer, business); My
 * look and the Game Room time read from the server; the list view and keyboard walk work; and the classic menu switch.
 * CAMPUS_E2E_MODE=off checks the other side: with CAMPUS_ENABLED=off on the backend, the portal is the classic one.
 *
 * Stack, seed and commands: tests/systemV2/campus-stack.md. Refuses (exit 2) any non-local URL before a browser starts,
 * and checks the seeded marker cohort through the API, so it can only ever run against the throwaway campus_e2e database.
 *
 *   BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 node tests/systemV2/campus.e2e.js
 */
const fs = require('fs');
const path = require('path');
const { assertLocalOnly } = require('./lib/localOnly');

const urls = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150', api: process.env.API_URL || 'http://127.0.0.1:3101' });
const { chromium } = require(process.env.PW_PATH || 'playwright');
const MODE = process.env.CAMPUS_E2E_MODE === 'off' ? 'off' : 'on';
const TOKENS_FILE = path.resolve(process.env.TOKENS_FILE || path.join(__dirname, '..', '..', 'tmp', 'campus-e2e-tokens.json'));
const MARKER = 'campus-e2e-marker';
const AUDIENCES = ['member', 'explorer', 'business', 'staff'];

const results = [];
async function step(audience, name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ audience, name, ok: true });
    console.log(`PASS [${audience}] ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ audience, name, ok: false, error: e.message });
    console.log(`FAIL [${audience}] ${name}: ${e.message.split('\n')[0]}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

async function api(pathname, jwt) {
  const r = await fetch(urls.api + pathname, { headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
}

async function newPage(browser, jwt, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  // Reduce motion on: walks and door zooms are instant, so steps never race an animation.
  await context.addInitScript(([t]) => {
    try {
      localStorage.setItem('participant_token', t);
      if (!localStorage.getItem('colaberry.campus.settings.v1')) {
        localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
      }
    } catch { /* storage blocked: the test will fail on the first assertion */ }
  }, [jwt]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, context, errors };
}

async function runAudience(browser, audience, jwt) {
  const { page, context, errors } = await newPage(browser, jwt);
  try {
    await step(audience, 'the portal opens on the campus', async () => {
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('nav.cm-nav[aria-label="Campus"]', { timeout: 30_000 });
      must(await page.locator('[data-testid="cm-banner"]').count() > 0 || await page.locator('nav.cm-nav').count() > 0, 'no campus');
    });

    await step(audience, 'every building opens its real page with the banner', async () => {
      // Admin rooms (the Staff Office) open the Management Portal in a new tab, not a campus page; checked separately below.
      const hrefs = await page.locator('nav.cm-nav .cm-nav-list a:not([data-admin])').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      must(hrefs.length >= 6, `only ${hrefs.length} building links`);
      for (const href of hrefs) {
        await page.goto(urls.base + href, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-banner"]', { timeout: 30_000 }).catch(() => { throw new Error(`no banner on ${href}`); });
      }
    });

    if (audience === 'staff') {
      await step(audience, 'the Staff Office opens the Management Portal in a new tab', async () => {
        await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
        // Management access is read asynchronously (GET /api/portal/mgmt/status): disabled until it answers, then a link.
        await page.waitForSelector('nav.cm-nav .cm-nav-list a[data-admin]', { timeout: 15_000 });
        const link = page.locator('nav.cm-nav .cm-nav-list a[data-admin]');
        must(await link.count() === 1, 'no admin link in the nav');
        must(await link.getAttribute('target') === '_blank', 'Staff Office does not open in a new tab');
      });
    }

    await step(audience, 'presence answers, and the map opens', async () => {
      const r = await api('/api/portal/campus/presence', jwt);
      must(r.status === 200 && r.body && typeof r.body === 'object', `presence ${r.status}`);
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.click('[data-testid="cm-open-map"]');
      await page.waitForSelector('[data-testid="cm-overlay"]', { timeout: 15_000 });
    });

    await step(audience, 'the staff desks this audience should see', async () => {
      await page.click('[data-testid="cm-overlay"] g[data-building="commons"]');
      await page.waitForSelector('[data-testid="cm-desk-reese"]', { timeout: 15_000 });
      await page.keyboard.press('Escape'); // closes the card, not the map
      const hasGate = await page.locator('[data-testid="cm-overlay"] g[data-building="gate"]').count() > 0;
      must(hasGate === (audience === 'explorer' || audience === 'staff'), `Main Gate shown=${hasGate}`);
      if (hasGate) {
        await page.click('[data-testid="cm-overlay"] g[data-building="gate"]');
        await page.waitForSelector('[data-testid="cm-desk-maya"]', { timeout: 15_000 });
        await page.keyboard.press('Escape');
      }
    });

    await step(audience, 'keyboard: Tab to a building, Enter opens its card with focus on the heading', async () => {
      await page.locator('[data-testid="cm-overlay"] g[data-building="library"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="cm-card"][data-building="library"]', { timeout: 15_000 });
      const focused = await page.evaluate(() => document.activeElement?.classList.contains('cm-card-title'));
      must(focused, 'focus did not move to the card heading');
      await page.keyboard.press('Escape');
    });

    if (audience !== 'staff') {
      await step(audience, 'the tour runs to its end', async () => {
        await page.click('[data-testid="cm-tour-start-bar"]');
        await page.waitForSelector('[data-testid="cm-tour"]', { timeout: 15_000 });
        for (let i = 0; i < 12 && await page.locator('[data-testid="cm-tour-end"]').count() === 0; i += 1) {
          await page.click('[data-testid="cm-tour-next"]');
        }
        await page.waitForSelector('[data-testid="cm-tour-end"]', { timeout: 15_000 });
        await page.keyboard.press('Escape');
      });
    } else {
      await step(audience, 'no tour is offered to staff', async () => {
        must(await page.locator('[data-testid="cm-tour-start-bar"]').count() === 0, 'staff were offered a tour');
      });
    }

    await step(audience, 'My look reads from the server', async () => {
      const r = await api('/api/portal/campus/look', jwt);
      must(r.status === 200 && Array.isArray(r.body?.catalog), `look ${r.status}`);
      await page.click('[data-testid="cm-look-open-bar"]');
      await page.waitForSelector('.cm-look', { timeout: 15_000 });
      await page.keyboard.press('Escape');
    });

    await step(audience, 'the list view lists the campus', async () => {
      await page.click('[data-testid="cm-overlay"] button:has-text("List view")');
      await page.waitForSelector('[data-testid="cm-list"] section[data-building]', { timeout: 15_000 });
      must(await page.locator('[data-testid="cm-list"] section[data-building]').count() >= 6, 'too few buildings in the list');
      await page.keyboard.press('Escape');
    });

    await step(audience, 'the Game Room shows today\'s time from the server', async () => {
      const r = await api('/api/portal/game-room/time', jwt);
      must(r.status === 200 && typeof r.body?.left_s === 'number', `game time ${r.status}`);
      await page.goto(`${urls.base}/portal/game-room`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /left today/.test(document.querySelector('[data-testid="gr-time"]')?.textContent || ''), null, { timeout: 30_000 });
    });

    await step(audience, 'Use classic menu switches to the classic portal, and back', async () => {
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.click('[data-testid="cm-use-classic"]');
      await page.waitForSelector('nav.te-nav', { timeout: 15_000 });
      await page.click('[data-testid="cm-use-campus"]');
      await page.waitForSelector('nav.cm-nav', { timeout: 15_000 });
    });

    await step(audience, 'no uncaught page errors', async () => { must(errors.length === 0, errors.slice(0, 3).join(' | ')); });
  } finally {
    await context.close();
  }
}

async function runOff(browser, audience, jwt) {
  const { page, context } = await newPage(browser, jwt);
  try {
    await step(audience, 'flag off: the classic portal, no campus', async () => {
      const f = await api('/api/portal/campus/flags', jwt);
      must(f.status === 200 && f.body?.campus === false, `flags ${f.status} ${JSON.stringify(f.body)}`);
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('nav.te-nav', { timeout: 30_000 });
      must(await page.locator('nav.cm-nav, [data-testid="cm-banner"], [data-testid="cm-use-campus"]').count() === 0, 'campus UI visible with the flag off');
    });
  } finally {
    await context.close();
  }
}

(async () => {
  const seeded = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  const marker = await api('/api/portal/profile', seeded.users.member.jwt);
  if (marker.body?.profile?.cohort?.name !== MARKER) {
    console.error(JSON.stringify({ event: 'campus_e2e_refused', outcome: 'failure', error_class: 'ValidationError', reason: 'the backend is not reading the seeded campus_e2e database' }));
    process.exit(2);
  }
  console.log(`campus e2e (${MODE}) against ${urls.base} / ${urls.api}`);
  const browser = await chromium.launch();
  try {
    for (const a of AUDIENCES) await (MODE === 'off' ? runOff : runAudience)(browser, a, seeded.users[a].jwt);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(JSON.stringify({ event: 'campus_e2e_crashed', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(1); });
