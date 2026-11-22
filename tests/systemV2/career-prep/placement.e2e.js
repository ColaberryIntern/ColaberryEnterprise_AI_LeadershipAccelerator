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
 *   PL5 (CP9.1) candidate consent gates the meeting link: the consent screen names recording AND AI scoring of the
 *       voice and words (from the audio only), says any no = unrecorded with no replay, gives No the same button as Yes,
 *       and shows NO meeting link; a double click on Yes sends ONE decision, then Open the meeting carries the link
 *   PL6 (CP9.1) the candidate interview room fits a phone (390 wide): no horizontal scroll, every control 44px or taller
 *   PL7 (CP9.2) a held interview with a scored replay: the KPI reads "Held and scored" (1 scored), the row shows its
 *       score, and its History drawer shows the replay (score, "never the video", one card per answer with pace, filler
 *       words and key words covered) with the recording on OUR server's path; no meeting link, no face wording
 *   PL8 (CP9.2) the replay in the History drawer fits a phone (390 wide): no horizontal scroll
 *   PLX zero console errors in these flows
 *
 * Usage (repo root): node tests/systemV2/career-prep/placement.e2e.js, or runAll.js (env: see harness.js)
 */
const { BASE, check, newPage, tid, shot, runSuite } = require('./harness');

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

/** Elements that scroll sideways on the interview room page, and the page itself (a phone must have none). */
const roomSideways = () => [document.documentElement, ...document.querySelectorAll('.cp-iroom *')]
  .filter((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)).map((el) => el.className).slice(0, 3)
  .concat(document.documentElement.scrollWidth > innerWidth + 1 ? ['page'] : []);

async function flowRoom(browser, viewport) {
  const { ctx, page, errors, api } = await newPage(browser, { api: { placement: true }, viewport: viewport || { width: 1600, height: 960 } });
  page.setDefaultTimeout(8000);
  const name = viewport ? 'PL6 the candidate interview room fits a phone (390): no horizontal scroll, 44px controls' : 'PL5 candidate consent gates the meeting link';
  try {
    await page.goto(`${BASE}/portal/career/interview/pi-7`);
    await page.waitForSelector(tid('cp-iroom-consent'));
    await shot(page, viewport ? 'iroom-candidate-390' : 'iroom-candidate-1600');
    if (viewport) {
      const m = await page.evaluate(() => ({ minH: Math.min(...[...document.querySelectorAll('.cp-iroom-choice, [data-testid="cp-iroom-prep-toggle"], [data-testid="cp-iroom-back"]')].map((b) => b.getBoundingClientRect().height)) }));
      const wide = await page.evaluate(roomSideways);
      check(name, wide.length === 0 && m.minH >= 44, JSON.stringify({ wide, minH: m.minH }));
    } else {
      const before = await page.evaluate(() => ({ text: document.querySelector('[data-testid="cp-iroom-consent"]')?.textContent || '', rec: document.querySelector('[data-testid="cp-iroom-rec"]')?.textContent,
        same: document.querySelector('[data-testid="cp-iroom-consent-btn"]')?.className === document.querySelector('[data-testid="cp-iroom-decline-btn"]')?.className,
        sizes: [...document.querySelectorAll('.cp-iroom-choice')].map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }),
        open: !!document.querySelector('[data-testid="cp-iroom-open"]'), zoom: /zoom\.example/.test(document.documentElement.outerHTML) }));
      await page.locator(tid('cp-iroom-consent-btn')).dblclick();
      await page.waitForSelector(tid('cp-iroom-open'));
      const href = await page.getAttribute(tid('cp-iroom-open'), 'href');
      check(name, /AI scores your voice and words/.test(before.text) && /scores the audio only; it never analyzes the video/.test(before.text) && /not recorded, nothing is scored, and there is no replay/.test(before.text)
        && before.rec === 'RECORDING 0 OF 2 CONSENTED' && before.same && before.sizes.length === 2 && before.sizes[0] === before.sizes[1] && !before.open && !before.zoom
        && api.state.roomDecisions.join() === 'consent' && href === 'https://zoom.example/j/SECRET', JSON.stringify({ ...before, text: before.text.slice(0, 60), decisions: api.state.roomDecisions, href }));
    }
  } catch (e) {
    check(name, false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

async function flowReplay(browser, viewport) {
  const { ctx, page, errors } = await newPage(browser, { api: { placement: true, held: true }, viewport: viewport || { width: 1440, height: 960 } });
  page.setDefaultTimeout(8000);
  const name = viewport ? 'PL8 the replay in the History drawer fits a phone (390): no horizontal scroll' : 'PL7 a held, scored interview: "Held and scored", the score on its row, the replay in its drawer';
  try {
    await page.goto(`${BASE}/portal/career/room#interviews`);
    await page.waitForSelector(tid('cp-ivs-row-pi-8'));
    await page.click(tid('cp-ivs-history-pi-8'));
    await page.waitForSelector(tid('cp-ivs-q-2'));
    await page.locator(tid('cp-ivs-replay')).scrollIntoViewIfNeeded();
    await shot(page, viewport ? 'replay-drawer-390' : 'replay-drawer-1440');
    if (viewport) {
      const wide = await page.evaluate(sideways);
      check(name, wide.length === 0, JSON.stringify(wide));
    } else {
      const s = await page.evaluate(() => ({
        kpis: document.querySelector('[data-testid="cp-ivs-kpis"]')?.textContent || '',
        row: document.querySelector('[data-testid="cp-ivs-score-pi-8"]')?.textContent || '',
        bookedScore: !!document.querySelector('[data-testid="cp-ivs-score-pi-7"]'),
        replay: document.querySelector('[data-testid="cp-ivs-replay"]')?.textContent || '',
        cards: document.querySelectorAll('[data-testid^="cp-ivs-q-"]').length,
        video: document.querySelector('[data-testid="cp-ivs-replay-video"]')?.getAttribute('src') || '',
        zoom: /zoom/i.test([...document.querySelectorAll('.cp-ivs a, .cp-ivs video')].map((e) => e.getAttribute('href') || e.getAttribute('src') || '').join(' ')),
        words: /\bface|eye contact|expression|accent/i.test(document.querySelector('.cp-ivs')?.textContent || ''),
      }));
      check(name, /Held and scored/.test(s.kpis) && /1 scored/.test(s.kpis) && s.row.trim() === 'Score 84' && !s.bookedScore
        && /Replay: score 84/.test(s.replay) && /never the video/.test(s.replay) && /Question 1: Tell me about a data pipeline/.test(s.replay)
        && /Pace 100: 117 wpm/.test(s.replay) && /Covered the question 50: 2 of 4 key words/.test(s.replay) && s.cards === 2
        && /^\/api\/public\/replays\/pi-8\/recording\?p=c&x=/.test(s.video) && !s.zoom && !s.words, JSON.stringify({ ...s, replay: s.replay.slice(0, 120) }));
    }
  } catch (e) {
    check(name, false, String(e && e.message).split('\n')[0].slice(0, 200));
  }
  await ctx.close();
  return errors;
}

runSuite(9, async (browser) => {
  const errs = [...await flowInbox(browser), ...await flowInboxPhone(browser), ...await flowBooked(browser), ...await flowInterviewsPhone(browser),
    ...await flowRoom(browser), ...await flowRoom(browser, { width: 390, height: 844 }), ...await flowReplay(browser), ...await flowReplay(browser, { width: 390, height: 844 })];
  check('PLX zero console errors in the placement flows', errs.length === 0, errs.slice(0, 3).join(' | '));
});
