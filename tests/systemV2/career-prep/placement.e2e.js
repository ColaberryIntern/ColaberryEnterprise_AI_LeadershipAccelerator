/**
 * Career Prep v27, Releases 2 and 3 (the getting-hired pipeline) in a real browser (Edge), against the BUILT app with the
 * platform API answered from fixtures (fakeApi.js). Shares harness.js with the other suites. Checks are added per task.
 *
 * Checks:
 *   PL1 (CP6.1) the #inbox sheet shows the status card (no address yet, "Not set up yet"), the four setup steps with the
 *       forwarding path to the central inbox, "Nothing has arrived yet" and "What we never do"; saving a Gmail address
 *       ticks steps 1 and 2 and shows the address, still "Not set up yet" (forwarding not verified)
 *   PL2 (CP6.1) the #inbox sheet fits a phone (390 wide): no horizontal scroll
 *   PLX zero console errors in these flows
 *
 * Usage (repo root): node tests/systemV2/career-prep/placement.e2e.js, or runAll.js (env: see harness.js)
 */
const { BASE, check, newPage, tid, runSuite } = require('./harness');

async function inboxSheet(browser, viewport) {
  const { ctx, page, errors, api } = await newPage(browser, viewport ? { viewport } : {});
  page.setDefaultTimeout(8000);
  await page.goto(`${BASE}/portal/career/room#inbox`);
  await page.waitForSelector(tid('cp-inbox-sheet'));
  return { ctx, page, errors, api };
}

async function flowInbox(browser) {
  const { ctx, page, errors } = await inboxSheet(browser);
  try {
    const before = await page.evaluate(() => ({
      addr: document.querySelector('[data-testid="cp-inbox-addr"]')?.textContent,
      health: document.querySelector('[data-testid="cp-inbox-health"]')?.textContent,
      steps: document.querySelectorAll('[data-testid^="cp-inbox-step-"]').length,
      done: document.querySelectorAll('[data-testid^="cp-inbox-step-"][data-done="yes"]').length,
      central: /c_interviews@colaberry\.com/.test(document.querySelector('[data-testid="cp-inbox-step-forwarding"]')?.textContent || ''),
      empty: document.querySelector('[data-testid="cp-inbox-empty"]')?.textContent,
      never: /never log in to your Gmail/.test(document.querySelector('[data-testid="cp-inbox-never"]')?.textContent || ''),
    }));
    await page.fill(tid('cp-inbox-address'), 'Ann.Lee.Careers@gmail.com');
    await page.click(tid('cp-inbox-save'));
    await page.waitForFunction(() => document.querySelector('[data-testid="cp-inbox-addr"]')?.textContent?.includes('@gmail.com'));
    const after = await page.evaluate(() => ({
      addr: document.querySelector('[data-testid="cp-inbox-addr"]')?.textContent,
      health: document.querySelector('[data-testid="cp-inbox-health"]')?.textContent,
      done: [...document.querySelectorAll('[data-testid^="cp-inbox-step-"][data-done="yes"]')].map((el) => el.getAttribute('data-testid')),
    }));
    check('PL1 #inbox: status card, four steps with the central forwarding address, nothing received, what we never do; saving ticks steps 1 and 2',
      before.addr === 'No address yet' && before.health === 'Not set up yet' && before.steps === 4 && before.done === 0 && before.central
        && before.empty === 'Nothing has arrived yet.' && before.never && after.addr === 'ann.lee.careers@gmail.com' && after.health === 'Not set up yet'
        && after.done.join() === 'cp-inbox-step-create,cp-inbox-step-added', JSON.stringify({ before, after }));
  } catch (e) {
    check('PL1 the #inbox flow ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

async function flowInboxPhone(browser) {
  const { ctx, page, errors } = await inboxSheet(browser, { width: 390, height: 844 });
  try {
    const wide = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('.cp-room *')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).map((el) => el.className).slice(0, 3)
      .concat(document.documentElement.scrollWidth > innerWidth + 1 ? ['page'] : []));
    check('PL2 the #inbox sheet fits a phone (390): no horizontal scroll', wide.length === 0, JSON.stringify(wide));
  } catch (e) {
    check('PL2 the phone #inbox ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

runSuite(3, async (browser) => {
  const errs = [...await flowInbox(browser), ...await flowInboxPhone(browser)];
  check('PLX zero console errors in the placement flows', errs.length === 0, errs.slice(0, 3).join(' | '));
});
