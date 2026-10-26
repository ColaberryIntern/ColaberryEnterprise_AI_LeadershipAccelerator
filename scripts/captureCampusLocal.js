/**
 * Colaberry Campus screenshots per audience (C11), from the LOCAL e2e stack only (tests/systemV2/campus-stack.md).
 *
 * For member, Explorer, business and staff, at desktop 1440x900 and phone 390x844: the portal home on the campus, and the
 * map opened at that audience's signature building (member: Community Lounge and Reese's desk; Explorer: the Main Gate and
 * Maya; business: Partner Office; staff: Staff Office). Each shot is DOM-checked before it is taken, so a picture of the
 * wrong thing fails the run instead of being attached. Widths go through captureHelpers (safe-width rule).
 *
 *   BASE_URL=http://localhost:3150 PW_PATH=<playwright> node scripts/captureCampusLocal.js <outDir>
 */
const fs = require('fs');
const path = require('path');
const { assertLocalOnly } = require('../tests/systemV2/lib/localOnly');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const { base } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150' });
const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'tmp/campus-c11-shots');
const TOKENS = JSON.parse(fs.readFileSync(path.resolve(process.env.TOKENS_FILE || 'tmp/campus-e2e-tokens.json'), 'utf8'));

const SIGNATURE = {
  member: { building: 'commons', check: '[data-testid="cm-desk-reese"]' },
  explorer: { building: 'gate', check: '[data-testid="cm-desk-maya"]' },
  business: { building: 'career', check: '[data-testid="cm-card"][data-building="career"]' },
  staff: { building: 'career', check: '[data-testid="cm-card"][data-building="career"]' },
};
const SIZES = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
// C16: 1920 wide, only for the fidelity views that name it in `sizes` (22-page-nav checks the bar at 1440 and 1920)
const WIDE = { name: 'wide', width: 1920, height: 1080 };
// C40: half a laptop screen (a Claude Code terminal on the other half), only for the views that name it in `sizes`
const HALF = { name: 'half', width: 1100, height: 1000 };

/**
 * --fidelity (C11b): drive the build into the 12 fidelity views for every account and size, assert each view's required
 * data-testids are present and visible (tests/systemV2/lib/campusFidelityViews.js mirrors the checklist), screenshot it, and
 * record the boxes of the big regions for the side-by-side overlap check. ANY missing testid fails the run; the shot is still
 * taken so the gap is visible next to the prototype.
 */
const REGIONS = { topbar: 'cm-topbar', concierge: 'cm-concierge', arrive: 'cm-arrive', tabbar: 'cm-tabbar', pageBar: 'cm-page-bar',
  pageSide: 'cm-page-side', pageRail: 'cm-page-rail', gateId: 'cm-gate-id', inside: 'cm-inside' };

async function visibleBox(page, id) {
  // a test id, or (for components without one) a CSS selector starting with '.', '[' or a tag
  const sel = /^[.[#]|^[a-z]+[.[ ]/.test(id) ? id : `[data-testid="${id}"]`;
  const el = page.locator(sel).first();
  if (!(await el.count())) return null;
  const box = await el.boundingBox();
  return box && box.width > 0 && box.height > 0 && (await el.isVisible()) ? box : null;
}

const LIVE_MOCK = { states: ['live'], broadcasts: [{ id: 'b1', title: 'Colaberry AI Sessions', access_mode: 'paid', editorial_state: 'live', room_id: 'r1',
  content_started_at: Date.now() - 60000, scheduled_start_at: null, can_watch: true, reason: 'ok', offer_upgrade: false, preview_seconds_remaining: null }] };

async function runFidelity(browser) {
  const { ACCOUNTS, VIEWS } = require('../tests/systemV2/lib/campusFidelityViews');
  // --only=<view name> re-runs one view (all accounts and sizes)
  const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;
  const results = [];
  for (const size of [...SIZES, WIDE, HALF]) {
    for (const account of ACCOUNTS) {
      for (const view of VIEWS) {
        if (ONLY && view.name !== ONLY) continue;
        if (!(view.sizes ?? ['desktop', 'phone']).includes(size.name)) continue;
        if (view.accounts && !view.accounts.includes(account)) continue;
        if (view.desktopOnly && size.name !== 'desktop') continue;
        const ctx = await createSafeContext(browser, { token: TOKENS.users[account].jwt, viewport: { width: size.width, height: size.height, deviceScaleFactor: 1 } });
        // motion is the REDUCE-motion choice: 'on' = arrivals are instant (stable shots); a view with reduceMotion: false walks
        await ctx.addInitScript(({ fresh, motion }) => {
          try {
            localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion }));
            // Every view but the gate starts past today's gate; the gate view starts before it.
            for (const k of Object.keys(localStorage)) if (k.startsWith('colaberry.campus.gate.')) localStorage.removeItem(k);
            if (!fresh) localStorage.setItem('colaberry.campus.gate.seen', 'always');
          } catch { /* no storage */ }
        }, { fresh: !!view.fresh, motion: view.reduceMotion === false ? 'off' : 'on' });
        const page = await ctx.newPage();
        // Live views: broadcast discovery is MOCKED here (capture only) so a live broadcast exists on the local stack.
        if (view.needsLive) await page.route('**/api/portal/broadcasts/active', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(LIVE_MOCK) }));
        const row = { account, size: size.name, view: view.name, missing: [], known: view.known ? view.known(account, size.name) : [], regions: {}, error: null };
        try {
          await page.goto(base + view.route, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForTimeout(1200);
          for (const s of (view.steps ? view.steps(account) : [])) {
            if (s.click) { await page.locator(s.click).first().click({ timeout: 10_000 }); await page.waitForTimeout(900); }
            // settle: a mid-animation view (WP-3 17-travel) checks before the usual 900 ms pause would let the walk finish
            if (s.evaluate) { await page.evaluate(s.evaluate); await page.waitForTimeout(s.settle ?? 900); }
            if (s.wait) await page.waitForTimeout(s.wait);
          }
          for (const id of view.required(account, size.name)) if (!(await visibleBox(page, id))) row.missing.push(id);
          // WP-1: a view may assert a page fact (the camera back on the whole campus, the URL after Step outside).
          if (view.assert) { const why = await page.evaluate(view.assert(account, size.name)); if (why) row.missing.push(`assert: ${why}`); }
          for (const [k, id] of Object.entries(REGIONS)) { const b = await visibleBox(page, id); if (b) row.regions[k] = b; }
        } catch (e) {
          row.error = e.message.split('\n')[0];
        }
        const file = path.join(OUT, `${account}-${size.name}-${view.name}.png`);
        try { await safeScreenshot(page, file); } catch { /* page gone */ }
        row.file = path.basename(file);
        results.push(row);
        console.log(`${row.missing.length || row.error ? 'MISS' : 'OK  '} ${account} ${size.name} ${view.name}${row.missing.length ? ' (missing: ' + row.missing.join(', ') + ')' : ''}${row.known.length ? ' [known: ' + row.known.join('; ') + ']' : ''}${row.error ? ' ERROR ' + row.error : ''}`);
        await ctx.close();
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'fidelity-results.json'), JSON.stringify(results, null, 2));
  const bad = results.filter((r) => r.missing.length || r.error).length;
  console.log(`\nfidelity DOM gate: ${results.length - bad}/${results.length} views complete`);
  return bad;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  if (process.argv.includes('--fidelity')) {
    const bad = await runFidelity(browser);
    await browser.close();
    process.exit(bad ? 1 : 0);
  }
  const entries = [];
  let failures = 0;
  try {
    for (const audience of Object.keys(SIGNATURE)) {
      for (const size of SIZES) {
        const ctx = await createSafeContext(browser, { token: TOKENS.users[audience].jwt, viewport: { width: size.width, height: size.height, deviceScaleFactor: 1 } });
        await ctx.addInitScript(() => {
          try { localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' })); } catch { /* no storage */ }
        });
        const page = await ctx.newPage();
        try {
          // ?stay=1: since C11b a tab's first visit to Today opens the campus home (D1)
          await page.goto(`${base}/portal/today?stay=1`, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForSelector(size.name === 'desktop' ? 'nav.cm-nav' : 'nav.cm-tabbar', { timeout: 30_000 });
          await page.waitForSelector('[data-testid="cm-banner"]', { timeout: 30_000 });
          const home = path.join(OUT, `${audience}-${size.name}-home.png`);
          entries.push({ audience, size: size.name, view: 'home', ...(await safeScreenshot(page, home)) });

          await page.click(size.name === 'desktop' ? '[data-testid="cm-open-map"]' : 'nav.cm-tabbar button');
          // WP-1: the map is the campus home (one map), not an overlay on the page.
          await page.waitForSelector('[data-testid="cm-home"]', { timeout: 15_000 });
          const sig = SIGNATURE[audience];
          await page.locator(`.cm-home g[data-building="${sig.building}"]`).click();
          await page.waitForSelector(sig.check, { timeout: 15_000 });
          await page.waitForTimeout(300);
          const map = path.join(OUT, `${audience}-${size.name}-map.png`);
          entries.push({ audience, size: size.name, view: `map:${sig.building}`, ...(await safeScreenshot(page, map)) });
          console.log(`OK ${audience} ${size.name}`);
        } catch (e) {
          failures += 1;
          console.log(`FAIL ${audience} ${size.name}: ${e.message.split('\n')[0]}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeCaptureSummary(OUT, entries);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(JSON.stringify({ event: 'campus_capture_crashed', error_class: e.name, message: e.message })); process.exit(1); });
