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
      // WP-1: map steps now run on the campus home; its once-a-day gate is covered by the fidelity gate view, so skip it here.
      localStorage.setItem('colaberry.campus.gate.seen', 'always');
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
    await step(audience, 'the first visit to Today opens the campus home (C11b, D1)', async () => {
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((u) => u.pathname === '/portal/campus', { timeout: 30_000 });
      await page.waitForSelector('[data-testid="cm-home"] [data-testid="cm-world"]', { timeout: 30_000 });
      await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
      await page.waitForSelector('[data-testid="cm-topbar"]', { timeout: 30_000 });
    });

    await step(audience, 'Today stays reachable (later visits and ?stay=1 keep the campus nav)', async () => {
      await page.goto(`${urls.base}/portal/today?stay=1`, { waitUntil: 'domcontentloaded' });
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
      // WP-1, one map: opening the map from a page goes to the campus home, with its side panel.
      await page.waitForSelector('[data-testid="cm-home"] [data-testid="cm-concierge"]', { timeout: 15_000 });
      must(new URL(page.url()).pathname === '/portal/campus', `map opened at ${page.url()}`);
    });

    await step(audience, 'the staff desks this audience should see', async () => {
      // WP-5: the staff are chips at the head of Who's here; a press opens their card (a popover, Q7)
      await page.click('.cm-home g[data-building="commons"]');
      await page.click('[data-testid="cm-who-staff-reese"]', { timeout: 15_000 });
      await page.waitForSelector('[data-testid="cm-staff-card"] [data-testid="cm-desk-reese"]', { timeout: 15_000 });
      await page.keyboard.press('Escape'); // closes the staff card
      await page.keyboard.press('Escape'); // then the building card, not the map
      const hasGate = await page.locator('.cm-home g[data-building="gate"]').count() > 0;
      must(hasGate === (audience === 'explorer' || audience === 'staff'), `Main Gate shown=${hasGate}`);
      // C21 (v6 D3): Maya's desk is in Admissions, beside the gate, for every audience
      await page.click('.cm-home g[data-building="admissions"]');
      await page.click('[data-testid="cm-who-staff-maya"]', { timeout: 15_000 });
      await page.waitForSelector('[data-testid="cm-staff-card"] [data-testid="cm-desk-maya"]', { timeout: 15_000 });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    });

    await step(audience, 'keyboard: Tab to a building, Enter opens its card with focus on the heading', async () => {
      await page.locator('.cm-home g[data-building="library"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="cm-card"][data-building="library"]', { timeout: 15_000 });
      const focused = await page.evaluate(() => document.activeElement?.classList.contains('cm-card-title'));
      must(focused, 'focus did not move to the card heading');
      await page.keyboard.press('Escape');
    });

    if (audience === 'member') {
      await step(audience, 'v6 D1 (C24): in the Studio the spot and the board\'s main button reach the same page; "See all" reaches the section', async () => {
        const enterStudio = async () => {
          await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
          await page.evaluate(() => document.querySelector('[data-testid="cm-bld-studio"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
          await page.waitForSelector('[data-testid="cm-room3d"][data-room="studio"] .cm-r3-spot', { timeout: 15_000 });
          must(await page.locator('[data-testid="cm-inside-door"]').count() === 0, 'a door element is still in the room');
        };
        const landAfter = async (sel) => {
          await page.click(sel);
          await page.waitForURL((u) => u.pathname !== '/portal/campus', { timeout: 15_000 });
          return new URL(page.url()).pathname;
        };
        await enterStudio();
        const viaSpot = await landAfter('[data-testid="cm-spot-desk"]');
        await enterStudio();
        const viaBoard = await landAfter('[data-testid="cm-board-primary"]');
        must(viaSpot === viaBoard, `spot -> ${viaSpot}, board button -> ${viaBoard}`);
        await enterStudio();
        const viaSection = await landAfter('[data-testid="cm-board-section"]');
        must(viaSection === '/portal/projects', `See all -> ${viaSection}`);
      });

      await step(audience, 'C19: sitting at your desk opens the workstation (bench, two monitors, Cory, status bar); Stand up returns you into the Studio', async () => {
        await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
        await page.evaluate(() => document.querySelector('[data-testid="cm-bld-studio"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await page.waitForSelector('[data-testid="cm-room3d"][data-room="studio"] .cm-r3-spot', { timeout: 15_000 });
        await page.click('[data-testid="cm-spot-desk"]');
        await page.waitForSelector('[data-testid="cm-ws"]', { timeout: 15_000 });
        const ws = await page.evaluate(() => ({
          bezels: document.querySelectorAll('.cm-ws-bezel').length,
          trail: document.querySelector('[data-testid="cm-ws-trail"]')?.textContent || '',
          tickets: document.querySelectorAll('[data-testid="cm-ws-ticket"]').length,
          active: document.querySelectorAll('.cm-ws-ticket.is-active').length,
          parts: ['cm-ws-desk', 'cm-ws-cory', 'cm-ws-status', 'cm-ws-term'].filter((t) => !document.querySelector(`[data-testid="${t}"]`)),
        }));
        must(ws.bezels === 2, `bezels ${ws.bezels}`);
        must(ws.trail.startsWith('Your desk · '), `trail "${ws.trail}"`);
        must(ws.tickets >= 1 && ws.active === 1, `bench: ${ws.tickets} tickets, ${ws.active} on the desk`);
        must(ws.parts.length === 0, `missing ${ws.parts.join(', ')}`);
        await page.click('[data-testid="cm-ws-standup"]');
        await page.waitForURL((u) => u.pathname === '/portal/campus', { timeout: 15_000 });
        await page.waitForSelector('[data-testid="cm-room3d"][data-room="studio"]', { timeout: 15_000 });
      });

      // C20: needs the backend's in-memory admissions calendar (CAMPUS_CALENDAR_STUB=1, refused in production): no Google, no invite.
      await step(audience, 'C20: "Talk to a person" books a call with admissions; the confirmation shows and Coming up appears; Reschedule cancels it', async () => {
        await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-cc-talk"]', { timeout: 30_000 });
        await page.click('[data-testid="cm-cc-talk"]');
        await page.waitForSelector('[data-testid="cm-book"] [data-testid="cm-book-slots"] button', { timeout: 15_000 });
        await page.click('[data-testid="cm-book-topic-enroll"]');
        await page.click('[data-testid="cm-book-slots"] button');
        await page.click('[data-testid="cm-book-submit"]');
        await page.waitForSelector('[data-testid="cm-book-confirmed"]', { timeout: 15_000 });
        const when = await page.textContent('[data-testid="cm-book-when"]');
        must(/(CDT|CST) · 30 minutes on Google Meet$/.test(when || ''), `confirmation "${when}"`);
        await page.click('[data-testid="cm-book-confirmed"] button.pri');
        await page.waitForSelector('[data-testid="cm-cc-coming"]', { timeout: 15_000 });
        // clean up so a rerun starts empty: Coming up's Reschedule opens on the call; Reschedule cancels it
        await page.click('[data-testid="cm-cc-coming-reschedule"]');
        await page.waitForSelector('[data-testid="cm-book-already"]', { timeout: 15_000 });
        await page.click('[data-testid="cm-book-reschedule"]');
        await page.waitForSelector('[data-testid="cm-book-slots"]', { timeout: 15_000 });
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid="cm-cc-coming"]', { state: 'detached', timeout: 15_000 });
      });

      await step(audience, 'C21: Admissions beside the gate: the board prices come from the claims registry ($199 absent), the meeting table opens the booking sheet, /portal/plans has four cards', async () => {
        await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
        await page.evaluate(() => document.querySelector('[data-testid="cm-bld-admissions"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await page.waitForSelector('[data-testid="cm-room3d"][data-room="admissions"] [data-testid="cm-board-plans"]', { timeout: 15_000 });
        const board = await page.textContent('[data-testid="cm-board-plans"]');
        for (const want of ['$149', '$1,200', 'Scoped on a call', 'No card needed']) must((board || '').includes(want), `board lacks ${want}: "${board}"`);
        must(!(await page.textContent('body')).includes('$199'), '$199 is on the page');
        must(await page.locator('[data-testid="cm-adm-services"]').count() === 1, 'no service rows in the arrival card');
        await page.click('[data-testid="cm-room3d"] .cm-r3-spot');
        await page.waitForSelector('[data-testid="cm-book"]', { timeout: 15_000 });
        await page.keyboard.press('Escape');
        await page.goto(`${urls.base}/portal/plans`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-plans"]', { timeout: 30_000 });
        const cards = await page.evaluate(() => ['explorer', 'individual', 'team', 'services'].filter((id) => document.querySelector(`[data-testid="cm-plan-${id}"]`)).length);
        must(cards === 4, `plans page shows ${cards} of 4 cards`);
      });

      await step(audience, 'C27: the Schedule room shows the week strip and upcoming events; the Schedule page week has seven day columns', async () => {
        await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
        await page.evaluate(() => document.querySelector('[data-testid="cm-bld-tower"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await page.waitForSelector('[data-testid="cm-room3d"][data-room="tower"] [data-testid="cm-board-strip"]', { timeout: 15_000 });
        must(await page.locator('[data-testid="cm-board-strip"] .d').count() === 7, 'the strip is not seven days');
        await page.waitForSelector('[data-testid="cm-ev-upcoming"]', { timeout: 15_000 });
        // every Sign up on the campus opens Eventbrite in a new tab (the record); none is a portal RSVP
        const bad = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="cm-ev-signup-"]')).filter((a) => a.getAttribute('target') !== '_blank').length);
        must(bad === 0, `${bad} sign-up links do not open a new tab`);
        await page.goto(`${urls.base}/portal/schedule`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.sch-root .schtoolbar', { timeout: 30_000 });
        await page.click('.sch-root .toggle button:nth-child(2)');
        await page.waitForSelector('.sch-root .timegrid', { timeout: 15_000 });
        must(await page.locator('.sch-root .tg-dayhead').count() === 7, 'the week view is not seven days');
      });

      await step(audience, 'C29: Meeting Rooms: doors match the card rows; "+ New room" opens a real room (local DB) and it gets a door', async () => {
        const toHall = async () => {
          await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('[data-testid="cm-concierge"]', { timeout: 30_000 });
          await page.evaluate(() => document.querySelector('[data-testid="cm-bld-commons"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
          await page.waitForSelector('[data-testid="cm-room3d"][data-room="commons"] [data-testid="cm-board-new-room"]', { timeout: 15_000 });
          await page.waitForSelector('[data-testid="cm-hall-rows"] .cm-hall-rows, [data-testid="cm-hall-rows"] .cm-hall-muted', { timeout: 15_000 });
          await page.waitForTimeout(800);
        };
        const doors = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="cm-room3d"] .cm-mdoor')).map((d) => d.textContent));
        await toHall();
        const before = await doors();
        const rows = await page.locator('[data-testid^="cm-hall-row-"]').count();
        must(before.filter((t) => !t.includes('More rooms')).length === rows, `doors ${before.length} != card rows ${rows}`);
        must(before.length <= 6, `${before.length} doors (max 6)`);
        const name = `E2E hallway ${Date.now().toString(36)}`;
        await page.click('[data-testid="cm-board-new-room"]');
        await page.waitForSelector('[data-testid="cm-meet-new"]', { timeout: 10_000 });
        await page.fill('[data-testid="cm-meet-name"]', name);
        await page.click('[data-testid="cm-meet-go"]');
        await page.waitForURL(/\/portal\/rooms\/[0-9a-f-]{36}/, { timeout: 15_000 });
        await toHall();
        const after = await doors();
        must(after.some((t) => t.includes(name)) || (before.length === 6 && after.some((t) => t.includes('More rooms'))), `no door for the new room: ${after.join(' | ')}`);
      });

    }

    await step(audience, 'scrolled down, each page\'s sticky next task rides IN the location bar, never the header (Ali 2026-10-24)', async () => {
      // The 13 pages that hand PortalShell a condensedSlot. A page shows one only when it has a next step for this viewer.
      const pages = ['/portal/today?stay=1', '/portal/classroom', '/portal/projects', '/portal/cert-prep', '/portal/library', '/portal/schedule', '/portal/events',
        '/portal/rooms', '/portal/community', '/portal/internship', '/portal/path', '/portal/points', '/portal/portfolio'];
      const shown = [];
      for (const p of pages) {
        await page.goto(urls.base + p, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="cm-locbar"]', { timeout: 30_000 });
        await page.waitForTimeout(1200); // the page's data lands
        await page.evaluate(() => window.scrollTo(0, 800));
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => ({
          inBar: !!document.querySelector('[data-testid="cm-locbar"] [data-testid="cm-lb-next"] .te-condensed'),
          inHeader: !!document.querySelector('.te-condensed-slot.is-visible .te-condensed'),
          barTop: Math.round(document.querySelector('[data-testid="cm-locbar"]').getBoundingClientRect().top),
          scrolled: window.scrollY > 200,
        }));
        must(!r.inHeader, `${p}: the next task jumped into the header`);
        if (r.scrolled) must(r.barTop === 0, `${p}: the bar is not stuck to the top (${r.barTop})`);
        if (r.inBar) shown.push(p);
      }
      must(shown.length > 0, 'no page put its next task in the bar');
      console.log(`      [${audience}] next task in the bar on ${shown.length}/${pages.length}: ${shown.join(' ')}`);
    });

    await step(audience, 'click-to-walk: three grass points, each ends within 4 units, no card, the whole campus (C17)', async () => {
      const settle = () => page.waitForFunction(() => !document.querySelector('[data-testid="cm-travel-text"]'), null, { timeout: 20_000 });
      const vb = () => page.evaluate(() => document.querySelector('.cm-home svg.cm-map').getAttribute('viewBox').split(' ').map(Number));
      // This run keeps reduce motion on (walks are instant); click-to-walk is about the walk itself, so motion goes on for this
      // step (the stored choice 'off' = never reduce) and back to 'on' at the end.
      const motion = (m) => page.evaluate((v) => {
        const k = 'colaberry.campus.settings.v1';
        localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), motion: v }));
      }, m);
      await motion('off');
      try {
      await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="cm-home"] [data-testid="cm-concierge"]', { timeout: 30_000 });
      await settle();
      await page.waitForTimeout(1500); // the camera eases back to the whole campus after the card closed
      // The whole-campus view, read once it has stopped moving (the ease can still be finishing after the wait above).
      let base = await vb();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(400);
        const again = await vb();
        if (JSON.stringify(again) === JSON.stringify(base)) break;
        base = again;
      }
      // Grass the viewer can actually click: world points in view whose top element is the map's ground (not a building, a desk,
      // you, or a panel over the map), spread over the campus.
      const spots = await page.evaluate(() => {
        const svg = document.querySelector('.cm-home svg.cm-map');
        const m = svg.getScreenCTM();
        const out = [];
        for (const [x, y] of [[720, 520], [180, 470], [860, 250], [640, 300], [120, 640], [880, 660], [360, 520], [700, 160]]) {
          const p = svg.createSVGPoint(); p.x = x; p.y = y; const s = p.matrixTransform(m);
          const el = document.elementFromPoint(s.x, s.y);
          if (el && svg.contains(el) && !el.closest('.cm-bld, .cm-hit-area, .cm-staff-tok, .cm-avatar')) out.push({ x, y, sx: s.x, sy: s.y });
          if (out.length === 3) break;
        }
        return out;
      });
      must(spots.length === 3, `only ${spots.length} clickable grass points in view`);
      for (const s of spots) {
        await page.mouse.click(s.sx, s.sy);
        await page.waitForSelector('[data-testid="cm-drop-pin"]', { timeout: 5_000 });
        await settle();
        await page.waitForTimeout(1500); // the camera's ease back to the whole campus
        const at = await page.evaluate(() => document.querySelector('[data-testid="cm-avatar"]').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number));
        must(Math.hypot(at[0] - s.x, at[1] - s.y) <= 4, `ended at ${at} for a click at ${s.x},${s.y}`);
        must(await page.locator('[data-testid="cm-card"]').count() === 0, 'a card opened');
        // The camera eases home: wait for the view to SETTLE on the whole campus (it must get there, not merely head there).
        const home = await page.waitForFunction((b) => {
          const v = document.querySelector('.cm-home svg.cm-map').getAttribute('viewBox').split(' ').map(Number);
          // within 4 units: since C21 the base fit is around y 390 and the eased-home view lands 2-3 units off on a 1460-wide box
          return v.every((x, i) => Math.abs(x - b[i]) <= 4);
        }, base, { timeout: 8_000 }).then(() => true, () => false);
        must(home, `view ${await vb()} never settled on the whole campus ${base}`);
      }
      } finally {
        await motion('on');
        await page.goto(`${urls.base}/portal/campus`, { waitUntil: 'domcontentloaded' });
      }
    });

    if (audience !== 'staff') {
      await step(audience, 'the tour runs to its end', async () => {
        await page.click('[data-testid="cm-concierge"] [data-testid="cm-cc-tour-start"]');
        // WP-2: the tour lives inside each stop's arrival panel, with the room behind it
        await page.waitForSelector('[data-testid="cm-card"] [data-testid="cm-tour"]', { timeout: 15_000 });
        must(await page.locator('[data-testid="cm-inside"]').count() === 1, 'no room behind the tour stop');
        for (let i = 0; i < 12; i += 1) {
          const label = (await page.locator('[data-testid="cm-tour-next"]').textContent()) || '';
          await page.click('[data-testid="cm-tour-next"]');
          if (!label.startsWith('Next:')) break; // the last stop: Finish tour, or the Explorer's unlock sheet
          await page.waitForSelector(`[data-testid="cm-card"] [data-testid="cm-tour"][data-stop="${i + 2}"]`, { timeout: 15_000 });
        }
        if (audience === 'explorer') {
          await page.waitForSelector('[data-testid="cm-unlock"] [data-testid="cm-tour-optin"]', { timeout: 15_000 });
          await page.keyboard.press('Escape');
        }
        // finishing the tour is remembered; the panel offers it again
        await page.waitForSelector('[data-testid="cm-cc-tour"][data-state="done"]', { timeout: 15_000 });
      });
    } else {
      await step(audience, 'no tour is offered to staff', async () => {
        must(await page.locator('[data-testid="cm-cc-tour"]').count() === 0, 'staff were offered a tour');
      });
    }

    await step(audience, 'My look reads from the server', async () => {
      const r = await api('/api/portal/campus/look', jwt);
      must(r.status === 200 && Array.isArray(r.body?.catalog), `look ${r.status}`);
      await page.click('[data-testid="cm-stats-me"]');
      // WP-7: the Me panel carries the locker tiles for learners, the earners note for everyone else, and the photo button
      const learner = audience === 'member' || audience === 'explorer';
      await page.waitForSelector(`[data-testid="cm-me"] [data-testid="${learner ? 'cm-locker' : 'cm-me-earners'}"]`, { timeout: 15_000 });
      must(await page.locator('[data-testid="cm-me-photo"]').count() === 1, 'no photo button in the Me panel');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="cm-me"]', { state: 'detached', timeout: 5_000 });
    });

    await step(audience, 'the list view lists the campus', async () => {
      await page.click('[data-testid="cm-topbar-list"]');
      await page.waitForSelector('[data-testid="cm-list"] section[data-building]', { timeout: 15_000 });
      must(await page.locator('[data-testid="cm-list"] section[data-building]').count() >= 6, 'too few buildings in the list');
      await page.keyboard.press('Escape');
    });

    await step(audience, 'Step outside on a page lands inside that building on the campus home (WP-1)', async () => {
      await page.goto(`${urls.base}/portal/library`, { waitUntil: 'domcontentloaded' });
      await page.click('[data-testid="cm-step-out"]');
      await page.waitForSelector('[data-testid="cm-home"] [data-testid="cm-card"][data-building="library"]', { timeout: 15_000 });
      must(await page.locator('[data-testid="cm-concierge"]').isVisible(), 'the side panel is not visible');
    });

    await step(audience, 'the Game Room shows today\'s time from the server', async () => {
      const r = await api('/api/portal/game-room/time', jwt);
      must(r.status === 200 && typeof r.body?.left_s === 'number', `game time ${r.status}`);
      await page.goto(`${urls.base}/portal/game-room`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => /left today/.test(document.querySelector('[data-testid="gr-time"]')?.textContent || ''), null, { timeout: 30_000 });
    });

    await step(audience, 'Use classic menu switches to the classic portal, and back', async () => {
      // C16: the classic choice lives in the Me panel (the bar's you button), not the left nav
      await page.goto(`${urls.base}/portal/today`, { waitUntil: 'domcontentloaded' });
      await page.click('[data-testid="cm-banner-me"]');
      await page.click('[data-testid="cm-me-classic"]');
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
