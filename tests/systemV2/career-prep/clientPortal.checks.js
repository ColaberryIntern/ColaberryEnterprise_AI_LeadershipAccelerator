/**
 * Career Prep v27, CP10.2: the employer portal checks (HS6 to HS12; HS11 and HS12 are CP10.3 follow-ups), run by hireSite.e2e.js against the built hire site
 * with the portal API answered by fakeClient.js. Split out of hireSite.e2e.js to keep each file under the size ceiling.
 */
const fs = require('fs');
const path = require('path');
const { check } = require('./harness');
const { clientPage, inventory, save, T, SHOTS, CLIENT_SHOTS, OFFER_COLS, ROOM: CLIENT_ROOM } = require('./fakeClient');

async function runClient(browser, all, base) {
  const name = 'HS6 client portal matches the design inventory';
  const c = await clientPage(browser, base);
  try {
    const { cards, ivs, offers, form } = await inventory(c);
    const ph = await clientPage(browser, base, { viewport: { width: 390, height: 844 } });
    try { await ph.page.waitForSelector(T('cand-card')); await save(ph.page, 'client-candidates-390'); } finally { all.push(...ph.errors); await ph.ctx.close(); }
    const shots = CLIENT_SHOTS.filter((s) => !fs.existsSync(path.join(SHOTS, `${s}.png`)));
    check(name, cards.search === '' && c.redeems.length === 1 && cards.n === 2 && cards.missing.length === 0 && /72/.test(cards.first) && /Freight ETA forecasting/.test(cards.first)
      && offers.kpis.join('|') === 'Offers out 1|Accepted 1|Fees on accepted offers $114,400 110% of first-year salary' && offers.cols.join('|') === OFFER_COLS.join('|')
      && /110% of the first-year salary/.test(offers.callout || '') && form.yearly && form.hourly === 'true' && form.hours === '40' && form.start === 'date' && form.respond === 'date'
      && form.calc && form.agree === false && form.send === true && form.follow === true && shots.length === 0
      && ivs.join.join('|') === CLIENT_ROOM && !ivs.pwned && /onerror/.test(ivs.text) && !/zoom\.example/.test(ivs.text),
    `address "${cards.search}", ${cards.n} cards, missing [${cards.missing.join(',')}], join [${ivs.join.length}], script ran ${ivs.pwned}, kpis [${offers.kpis.join('|')}], cols ${offers.cols.length}, hours ${form.hours}, send disabled ${form.send}, missing shots [${shots.join(',')}]`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
  await runOfferSend(browser, all, base);
  await runClientPhone(browser, all, base);
  await runBadLink(browser, all, base);
  await runCloseWhileSending(browser, all, base);
  await runFollowUp(browser, all, base);
  await runOfferFollowUp(browser, all, base);
}

/** HS11 (CP10.3): Schedule a follow-up from a card: a long dash is refused before saving; one save; the table shows it. */
async function runFollowUp(browser, all, base) {
  const name = 'HS11 follow-up: a long dash is refused with the message; Schedule it saves once at 9:00 AM Central; the table shows it held-aware';
  const c = await clientPage(browser, base);
  try {
    await c.page.waitForSelector(T('cand-card'));
    await c.page.click(`${T('cand-card')} ${T('act-followup')}`);
    await c.page.waitForSelector(T('followup-form'));
    await c.page.fill(T('fu-body'), `Hi {first} ${String.fromCharCode(0x2014)} just checking in.`);
    const dash = await c.page.evaluate(() => ({ why: document.querySelector('[data-testid="fu-why"]').textContent, save: document.querySelector('[data-testid="fu-save"]').disabled }));
    await c.page.fill(T('fu-body'), 'Hi {first}, just checking in on our offer.\n\nMeridian Freight');
    await c.page.fill(T('fu-date'), '2026-12-01');
    await c.page.locator(T('fu-save')).dblclick();
    await c.page.waitForSelector(T('followups-table'));
    const s = await c.page.evaluate(() => ({ notice: document.querySelector('[data-testid="notice"]')?.textContent || '', rows: document.querySelectorAll('[data-testid="followup-row"]').length,
      row: document.querySelector('[data-testid="followup-row"]')?.textContent || '', off: !!document.querySelector('[data-testid="mail-off"]') }));
    const b = c.fuPosts[0] || {};
    await save(c.page, 'client-followups-1440');
    // The dialog on a phone (390): nothing wider than the dialog or the screen, every control at least 44px.
    const ph = await clientPage(browser, base, { viewport: { width: 390, height: 844 } });
    let d = { inner: 1, spill: 1, minH: 0 };
    try {
      await ph.page.waitForSelector(T('cand-card'));
      await ph.page.click(`${T('cand-card')} ${T('act-followup')}`);
      await ph.page.waitForSelector(T('followup-form'));
      d = await ph.page.evaluate(() => { const dlg = document.querySelector('.cp-dialog'); const box = dlg.getBoundingClientRect();
        return { inner: dlg.scrollWidth - dlg.clientWidth, spill: Math.round(Math.max(...[...dlg.querySelectorAll('*')].map((x) => x.getBoundingClientRect().right)) - Math.min(box.right, window.innerWidth)),
          minH: Math.min(...[...dlg.querySelectorAll('button, input, select')].map((x) => x.getBoundingClientRect().height)) }; });
      await save(ph.page, 'client-followup-390');
    } finally { all.push(...ph.errors); await ph.ctx.close(); }
    check(name, /long dash/.test(dash.why) && dash.save === true && c.fuPosts.length === 1 && b.sendOn === '2026-12-01T15:00:00.000Z' && b.enrollmentId && b.onlyIf === 'no_reply'
      && !('attachments' in b) && s.rows === 1 && /Ann Lee/.test(s.row) && /Scheduled/i.test(s.row) && /scheduled for/.test(s.notice) && !/switched off/.test(s.notice) && s.off && d.inner <= 0 && d.spill <= 0 && d.minH >= 44,
    `phone dialog overflow ${d.inner}px, spill ${d.spill}px, smallest control ${Math.round(d.minH)}px, dash "${dash.why.slice(0, 40)}", save disabled ${dash.save}, ${c.fuPosts.length} request(s), sendOn ${b.sendOn}, rows ${s.rows}, banner ${s.off}, notice "${s.notice.slice(0, 60)}"`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

/** HS12 (CP10.3): the offer dialog's follow-up box (on by default) schedules the Offer reminder once, tied to the offer. */
async function runOfferFollowUp(browser, all, base) {
  const name = 'HS12 the offer\'s follow-up box schedules the Offer reminder once (9:00 AM Central, only if no reply)';
  const c = await clientPage(browser, base, { mailOn: true });
  try {
    await c.page.waitForSelector(T('cand-card'));
    await c.page.click(`${T('cand-card')} ${T('act-offer')}`);
    await c.page.fill(T('offer-salary'), '105000');
    await c.page.check(T('offer-agree'));
    await c.page.locator(T('offer-send')).dblclick();
    await c.page.waitForFunction(() => /follow-up/i.test(document.querySelector('[data-testid="notice"]')?.textContent || ''));
    const notice = await c.page.locator(T('notice')).textContent();
    const b = c.fuPosts[0] || {};
    check(name, c.posts.length === 1 && c.fuPosts.length === 1 && b.template === 'offer_reminder' && b.onlyIf === 'no_reply' && b.offerId === '88888888-0000-4000-8000-000000000008'
      && /T1[45]:00:00\.000Z$/.test(b.sendOn || '') /* 9:00 AM Central: 15:00Z in standard time, 14:00Z in daylight time */ &&/Offer sent\. Follow-up to Ann Lee scheduled for/.test(notice) && !/switched off/.test(notice),
    `${c.posts.length} offer(s), ${c.fuPosts.length} follow-up(s), template ${b.template}, sendOn ${b.sendOn}, notice "${(notice || '').slice(0, 80)}"`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

async function runBadLink(browser, all, base) {
  const name = 'HS9 a spent or unknown sign-in link: the plain message, the address bar cleared, no data asked for';
  const c = await clientPage(browser, base, { token: '0f0f0f0f-1111-4111-8111-999999999999' });
  try {
    await c.page.waitForSelector(T('signin-msg'));
    const s = await c.page.evaluate(() => ({ search: location.search, msg: document.querySelector('[data-testid="signin-msg"]').textContent, cards: document.querySelectorAll('[data-testid="cand-card"]').length }));
    check(name, s.search === '' && /no longer valid/.test(s.msg) && s.cards === 0 && c.redeems.length === 1, `address "${s.search}", "${s.msg.slice(0, 60)}"`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  // The redeem 401 is the answer under test (the browser logs every non-2xx response).
  all.push(...c.errors.filter((e) => !/status of 401/.test(e))); await c.ctx.close();
}

async function runOfferSend(browser, all, base) {
  const name = 'HS7 client portal: Send disabled until agreed; hourly $50 x 40 shows $104,000 and $114,400';
  const c = await clientPage(browser, base);
  try {
    await c.page.waitForSelector(T('cand-card'));
    await c.page.click(`${T('cand-card')} ${T('act-offer')}`);
    await c.page.click(T('basis-hourly'));
    await c.page.fill(T('offer-rate'), '50');
    const calc = await c.page.evaluate(() => [document.querySelector('[data-testid="calc-first-year"]')?.textContent, document.querySelector('[data-testid="calc-fee"]')?.textContent]);
    const before = await c.page.locator(T('offer-send')).isDisabled();
    await c.page.check(T('offer-agree'));
    const after = await c.page.locator(T('offer-send')).isDisabled();
    await c.page.locator(T('offer-send')).dblclick();
    await c.page.waitForSelector(T('notice'));
    const b = c.posts[0] || {};
    check(name, calc.join('|') === '$104,000|$114,400' && before === true && after === false && c.posts.length === 1 && b.agreed === true && b.pay.rateCents === 5000 && b.pay.hoursPerWeek === 40
      && !/fee/i.test(Object.keys(b).join(',') + Object.keys(b.pay || {}).join(',')),
    `calc ${calc.join(' / ')}, disabled before ${before}, after ${after}, ${c.posts.length} offer request(s)`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

async function runClientPhone(browser, all, base) {
  const name = 'HS8 the employer portal fits a phone (390): no sideways scroll, 44px targets';
  // One long unbroken client name (it reaches the header and the dialog label): it must wrap, never push the dialog wide.
  const c = await clientPage(browser, base, { viewport: { width: 390, height: 844 }, clientName: 'MeridianFreightLogisticsInternationalHoldingsGroup' });
  try {
    await c.page.waitForSelector(T('cand-card'));
    const m = await c.page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth,
      minH: Math.min(...[...document.querySelectorAll('.cp-acts .btn, .cp-tabs button')].map((b) => b.getBoundingClientRect().height)) }));
    // The Make an offer dialog too, filled in (yearly, then hourly): nothing inside it wider than the dialog or the screen.
    await c.page.click(`${T('cand-card')} ${T('act-offer')}`);
    const measure = () => c.page.evaluate(() => { const dlg = document.querySelector('.cp-dialog'); const box = dlg.getBoundingClientRect();
      const right = Math.max(...[...dlg.querySelectorAll('*')].map((x) => x.getBoundingClientRect().right));
      return { inner: dlg.scrollWidth - dlg.clientWidth, spill: Math.round(right - box.right), page: Math.round(box.right - window.innerWidth),
        minH: Math.min(...[...dlg.querySelectorAll('button, input, select')].filter((x) => x.type !== 'checkbox').map((x) => x.getBoundingClientRect().height)) }; });
    await c.page.fill(T('offer-salary'), '98000');
    await c.page.check(T('offer-agree'));
    const y = await measure();
    await c.page.click(T('basis-hourly'));
    await c.page.fill(T('offer-rate'), '52.50');
    const h = await measure();
    const d = { inner: Math.max(y.inner, h.inner), spill: Math.max(y.spill, h.spill), page: Math.max(y.page, h.page), minH: Math.min(y.minH, h.minH) };
    check(name, m.over <= 0 && m.minH >= 44 && d.inner <= 0 && d.spill <= 0 && d.page <= 0 && d.minH >= 44,
      `page overflow ${m.over}px, smallest control ${Math.round(m.minH)}px; dialog inner overflow ${d.inner}px, spill ${d.spill}px, past screen ${d.page}px, smallest field ${Math.round(d.minH)}px`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  all.push(...c.errors); await c.ctx.close();
}

/** HS10: Escape, Close and the backdrop do nothing while a Send is in flight; the server's refusal lands in the form. */
async function runCloseWhileSending(browser, all, base) {
  const name = 'HS10 closing the offer dialog while a Send is in flight cannot lose the answer';
  const c = await clientPage(browser, base, { reject: true });
  try {
    await c.page.waitForSelector(T('cand-card'));
    await c.page.click(`${T('cand-card')} ${T('act-offer')}`);
    await c.page.fill(T('offer-salary'), '105000');
    await c.page.check(T('offer-agree'));
    await c.page.click(T('offer-send'));
    const closeDisabled = await c.page.locator('.cp-dialog [data-act="close"]').isDisabled();
    await c.page.keyboard.press('Escape');
    await c.page.mouse.click(5, 5); // the backdrop
    const during = await c.page.locator(T('offer-form')).isVisible();
    await c.page.waitForFunction(() => !document.getElementById('of-msg')?.hidden);
    const s = await c.page.evaluate(() => ({ open: !!document.querySelector('[data-testid="offer-form"]'), msg: document.getElementById('of-msg').textContent,
      send: document.querySelector('[data-testid="offer-send"]').disabled }));
    await c.page.keyboard.press('Escape'); // once answered, Escape closes again
    const after = await c.page.locator(T('offer-form')).count();
    check(name, closeDisabled && during && s.open && /start date must be a date/.test(s.msg) && s.send === false && c.posts.length === 1 && after === 0,
      `close disabled ${closeDisabled}, open during ${during}, message "${s.msg}", ${c.posts.length} request(s), closed after ${after === 0}`);
  } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 160)); }
  // The fixture's 400 is the answer under test (the browser logs every non-2xx response).
  all.push(...c.errors.filter((e) => !/status of 400/.test(e))); await c.ctx.close();
}

module.exports = { runClient };
