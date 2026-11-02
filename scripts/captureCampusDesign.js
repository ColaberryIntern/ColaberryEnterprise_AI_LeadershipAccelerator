/**
 * C23 WP-11: the DESIGN half of the side-by-side review. Drives the original prototype (docs/design/campus/colaberry-campus.html,
 * opened from disk, no network calls of its own) into the same views captureCampusLocal.js --fidelity takes of the build, for
 * the four audiences at desktop 1440x900 and phone 390x844. Files are named like the build's (`<account>-<size>-<view>.png`), so
 * scripts/buildCampusReview.js can pair them. The prototype's "sponsor" is the build's business account.
 *
 *   PW_PATH=<playwright> node scripts/captureCampusDesign.js <outDir> [--only=<view>]
 *
 * Views the prototype has no state for (13-recenter, 14-step-outside, 15-panel-with-card, 17-travel are behaviors the build's
 * e2e asserts; the later-round rooms have their own prototypes) are not captured and are listed as "build only" in the review.
 * A view whose step throws is recorded with its error and the run goes on; the run exits 1 if any view failed.
 */
const fs = require('fs');
const path = require('path');
const { safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const { chromium } = require(process.env.PW_PATH || 'playwright');
const OUT = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || 'tmp/campus-design-shots');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length) || null;
const PROTO = path.resolve(__dirname, '../docs/design/campus/colaberry-campus.html');

const ACCOUNTS = { member: 'member', explorer: 'explorer', business: 'sponsor', staff: 'staff' };
const SIZES = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
// the building each audience's arrival opens on, as the build's fidelity views (SIGNATURE in campusFidelityViews.js)
const SIGNATURE = { member: 'commons', explorer: 'lecture', business: 'career', staff: 'career' };

/** Page expressions run after the gate. `enter(false)` is the prototype's "Enter campus"; its entry animation ends by 2.1 s. */
const ENTER = 'enter(false)';
const HOME_WAIT = 2600;
const VIEWS = [
  { name: '01-gate', enter: false, run: [] },
  { name: '02-home', run: [] },
  { name: '03-arrive', run: (a) => [`arrive('${SIGNATURE[a]}', null, true)`], wait: 2200 },
  { name: '04-inside', run: (a) => [`arrive('${SIGNATURE[a]}', null, true)`], wait: 2200 },
  { name: '05-page', run: () => ["openPage(byId.library.primary[1], 'library')"], wait: 1200 },
  // the prototype starts its live moment only for the exact hash #live, which would also drop the account, so start it by hand
  { name: '06-live', pre: "moment = 'live'; sel.value = 'live'; startLiveMoment()", run: [], wait: 1500 },
  { name: '07-notifications', run: () => ["renderNotifPanel(); $('notifs').classList.add('on')"] },
  { name: '08-person-card', accounts: ['member', 'explorer', 'staff'], run: () => ["document.querySelector('#helpdesk [data-helpd]').click()"] },
  { name: '09-chat', accounts: ['member', 'explorer', 'staff'], run: () => ["openChat(document.querySelector('#helpdesk [data-helpd]').dataset.helpd)"] },
  { name: '10-toast', accounts: ['member'], run: () => ["inbound('p0', 'Hey! Are you picking up STORY-001 today?')"], wait: 900 },
  { name: '11-list', run: () => ['openList()'] },
  { name: '12-me', run: () => ['openMe()'] },
  { name: '16-tour', accounts: ['member', 'explorer', 'business'], enterExpr: 'enter(true)', run: [], wait: 1500 },
  { name: '18-wayfinder', run: () => ['openWF()'] },
  { name: '35-inbox', accounts: ['member', 'explorer', 'staff'], run: () => ["renderInbox(); $('inbox').classList.add('on')"] },
];

async function shoot(browser, view, account, size) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // the hash picks the account and skips the "seen today" quick entry, so every shot starts at the gate
    await page.goto(`file:///${PROTO.replace(/\\/g, '/')}#${ACCOUNTS[account]}`);
    await page.waitForTimeout(700);
    if (view.pre) await page.evaluate(view.pre);
    if (view.enter !== false) { await page.evaluate(view.enterExpr || ENTER); await page.waitForTimeout(HOME_WAIT); }
    const steps = typeof view.run === 'function' ? view.run(account) : view.run;
    for (const s of steps) { await page.evaluate(s); await page.waitForTimeout(250); }
    await page.waitForTimeout(view.wait || 600);
    const file = path.join(OUT, `${account}-${size.name}-${view.name}.png`);
    const shot = await safeScreenshot(page, file);
    return { account, size: size.name, view: view.name, ...shot, pageErrors: errors };
  } catch (e) {
    return { account, size: size.name, view: view.name, error: `${e.name}: ${e.message.split('\n')[0]}`, pageErrors: errors };
  } finally {
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const entries = [];
  try {
    for (const view of VIEWS.filter((v) => !ONLY || v.name === ONLY)) {
      for (const account of view.accounts || Object.keys(ACCOUNTS)) {
        for (const size of SIZES) {
          const r = await shoot(browser, view, account, size);
          console.log(`${r.error ? 'FAIL' : 'OK  '} ${account} ${size.name} ${view.name}${r.error ? ` ${r.error}` : ''}`);
          entries.push(r);
        }
      }
    }
  } finally {
    await browser.close();
  }
  writeCaptureSummary(OUT, entries.filter((e) => !e.error));
  fs.writeFileSync(path.join(OUT, 'design-results.json'), JSON.stringify(entries, null, 2));
  const failed = entries.filter((e) => e.error).length;
  console.log(`${entries.length - failed}/${entries.length} design shots in ${OUT}`);
  process.exit(failed ? 1 : 0);
})();
