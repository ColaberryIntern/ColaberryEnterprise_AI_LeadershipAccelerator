/**
 * Career Prep v27, Releases 2 and 3 (the getting-hired pipeline) in a real browser (Edge), against the BUILT app with the
 * platform API answered from fixtures (fakeApi.js). Shares harness.js with the other suites. Checks are added per task.
 *
 * Checks:
 *   PL1 (CP6.1) the #inbox sheet shows the status card (no address yet, "Not set up yet"), the four setup steps with the
 *       forwarding path to the central inbox, "Nothing has arrived yet" and "What we never do"; saving a Gmail address
 *       ticks steps 1 and 2 and shows the address, still "Not set up yet" (forwarding not verified)
 *   PL2 (CP6.1) the #inbox sheet fits a phone (390 wide): no horizontal scroll
 *   PL3 (CP8.3) a booked interview appears on the card (the floor's summary line), as an anchor card in the room and in
 *       #interviews (KPIs, the next-interview card, its row, Join waiting for 10 minutes before); Continue prep opens the
 *       room anchored on that same interview
 *   PL4 (CP8.3) the #interviews sheet fits a phone (390 wide): no horizontal scroll
 *   PLX zero console errors in these flows
 *
 * Usage (repo root): node tests/systemV2/career-prep/placement.e2e.js, or runAll.js (env: see harness.js)
 */
const { BASE, check, newPage, tid, runSuite } = require('./harness');

/** Elements that scroll sideways inside the room, and the page itself when it does (a phone layout must have none). */
const sideways = () => [document.documentElement, ...document.querySelectorAll('.cp-room *')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).map((el) => el.className).slice(0, 3)
  .concat(document.documentElement.scrollWidth > innerWidth + 1 ? ['page'] : []);

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
    const wide = await page.evaluate(sideways);
    check('PL2 the #inbox sheet fits a phone (390): no horizontal scroll', wide.length === 0, JSON.stringify(wide));
  } catch (e) {
    check('PL2 the phone #inbox ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

async function flowBooked(browser) {
  const { ctx, page, errors } = await newPage(browser, { api: { placement: true } });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(`${BASE}/portal/career`);
    await page.waitForSelector(tid('cp-greeting'));
    const card = await page.textContent(tid('cp-greeting'));
    await page.goto(`${BASE}/portal/career/room`);
    await page.waitForSelector(tid('cp-card-i7'));
    const anchor = await page.textContent(tid('cp-card-i7'));
    await page.goto(`${BASE}/portal/career/room#interviews`);
    await page.waitForSelector(tid('cp-ivs-row-pi-7'));
    const sheet = await page.evaluate(() => ({
      kpis: [...document.querySelectorAll('[data-testid^="cp-ivs-kpi-"]')].map((e) => e.textContent).join(),
      next: document.querySelector('[data-testid="cp-ivs-next"]')?.textContent || '',
      row: document.querySelector('[data-testid="cp-ivs-row-pi-7"]')?.textContent || '',
      joinNow: !!document.querySelector('[data-testid="cp-ivs-join"]'),
      joinLater: document.querySelector('[data-testid="cp-ivs-join-later"]')?.textContent || '',
      links: [...document.querySelectorAll('.cp-ivs a')].map((a) => a.getAttribute('href')).filter((h) => /zoom/i.test(h || '')),
    }));
    await page.click(tid('cp-ivs-prep'));
    await page.waitForFunction(() => /Northwind/.test(document.querySelector('[data-testid="cp-anchor"]')?.textContent || ''));
    const after = { search: new URL(page.url()).search, hash: new URL(page.url()).hash, pill: await page.textContent(tid('cp-anchor')) };
    check('PL3 a booked interview shows on the card, as an anchor and in #interviews; Continue prep anchors the room on it',
      /Your Northwind interview is/.test(card || '') && /Northwind · ML Engineer/.test(anchor || '') && sheet.kpis === '1,0,0,0'
        && /Northwind · ML Engineer/.test(sheet.next) && /Northwind/.test(sheet.row) && /Booked/.test(sheet.row) && /Recruiter screen 97%/.test(sheet.row)
        && !sheet.joinNow && /^Join opens /.test(sheet.joinLater) && sheet.links.length === 0
        && after.search === '?anchor=i7' && after.hash === '' && /Preparing for Northwind/.test(after.pill || ''), JSON.stringify({ card, anchor, sheet, after }));
  } catch (e) {
    check('PL3 the booked-interview flow ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

async function flowInterviewsPhone(browser) {
  const { ctx, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, api: { placement: true } });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(`${BASE}/portal/career/room#interviews`);
    await page.waitForSelector(tid('cp-ivs-row-pi-7'));
    const wide = await page.evaluate(sideways);
    check('PL4 the #interviews sheet fits a phone (390): no horizontal scroll', wide.length === 0, JSON.stringify(wide));
  } catch (e) {
    check('PL4 the phone #interviews ran', false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

runSuite(5, async (browser) => {
  const errs = [...await flowInbox(browser), ...await flowInboxPhone(browser), ...await flowBooked(browser), ...await flowInterviewsPhone(browser)];
  check('PLX zero console errors in the placement flows', errs.length === 0, errs.slice(0, 3).join(' | '));
});
