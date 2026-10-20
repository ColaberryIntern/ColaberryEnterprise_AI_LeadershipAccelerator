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

/**
 * --fidelity (C11b): drive the build into the 12 fidelity views for every account and size, assert each view's required
 * data-testids are present and visible (tests/systemV2/lib/campusFidelityViews.js mirrors the checklist), screenshot it, and
 * record the boxes of the big regions for the side-by-side overlap check. ANY missing testid fails the run; the shot is still
 * taken so the gap is visible next to the prototype.
 */
const REGIONS = { topbar: 'cm-topbar', concierge: 'cm-concierge', arrive: 'cm-arrive', tabbar: 'cm-tabbar', pageBar: 'cm-page-bar',
  pageSide: 'cm-page-side', pageRail: 'cm-page-rail', gateId: 'cm-gate-id', inside: 'cm-inside' };

async function visibleBox(page, id) {
  const el = page.locator(`[data-testid="${id}"]`).first();
  if (!(await el.count())) return null;
  const box = await el.boundingBox();
  return box && box.width > 0 && box.height > 0 && (await el.isVisible()) ? box : null;
}

async function runFidelity(browser) {
  const { ACCOUNTS, VIEWS } = require('../tests/systemV2/lib/campusFidelityViews');
  const results = [];
  for (const size of SIZES) {
    for (const account of ACCOUNTS) {
      for (const view of VIEWS) {
        if (view.accounts && !view.accounts.includes(account)) continue;
        const ctx = await createSafeContext(browser, { token: TOKENS.users[account].jwt, viewport: { width: size.width, height: size.height, deviceScaleFactor: 1 } });
        await ctx.addInitScript((fresh) => {
          try {
            localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
            // Every view but the gate starts past today's gate; the gate view starts before it.
            for (const k of Object.keys(localStorage)) if (k.startsWith('colaberry.campus.gate.')) localStorage.removeItem(k);
            if (!fresh) localStorage.setItem('colaberry.campus.gate.seen', 'always');
          } catch { /* no storage */ }
        }, !!view.fresh);
        const page = await ctx.newPage();
        const row = { account, size: size.name, view: view.name, missing: [], regions: {}, error: null };
        try {
          await page.goto(base + view.route, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForTimeout(1200);
          for (const s of (view.steps ? view.steps(account) : [])) {
            if (s.click) { await page.locator(s.click).first().click({ timeout: 10_000 }); await page.waitForTimeout(900); }
            if (s.evaluate) { await page.evaluate(s.evaluate); await page.waitForTimeout(900); }
          }
          for (const id of view.required(account, size.name)) if (!(await visibleBox(page, id))) row.missing.push(id);
          for (const [k, id] of Object.entries(REGIONS)) { const b = await visibleBox(page, id); if (b) row.regions[k] = b; }
        } catch (e) {
          row.error = e.message.split('\n')[0];
        }
        const file = path.join(OUT, `${account}-${size.name}-${view.name}.png`);
        try { await safeScreenshot(page, file); } catch { /* page gone */ }
        row.file = path.basename(file);
        results.push(row);
        console.log(`${row.missing.length || row.error ? 'MISS' : 'OK  '} ${account} ${size.name} ${view.name}${row.missing.length ? ' (' + row.missing.length + ' missing)' : ''}${row.error ? ' ERROR ' + row.error : ''}`);
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
          await page.goto(`${base}/portal/today`, { waitUntil: 'networkidle', timeout: 60_000 });
          await page.waitForSelector(size.name === 'desktop' ? 'nav.cm-nav' : 'nav.cm-tabbar', { timeout: 30_000 });
          await page.waitForSelector('[data-testid="cm-banner"]', { timeout: 30_000 });
          const home = path.join(OUT, `${audience}-${size.name}-home.png`);
          entries.push({ audience, size: size.name, view: 'home', ...(await safeScreenshot(page, home)) });

          await page.click(size.name === 'desktop' ? '[data-testid="cm-open-map"]' : 'nav.cm-tabbar button');
          await page.waitForSelector('[data-testid="cm-overlay"]', { timeout: 15_000 });
          const sig = SIGNATURE[audience];
          await page.locator(`[data-testid="cm-overlay"] g[data-building="${sig.building}"]`).click();
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
