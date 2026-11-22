/**
 * Career Prep v27, CP11.1b (kit F9): the staff interview desk in a real browser (Edge), against the BUILT app with the desk
 * API answered from fixtures (fakeDesk.js), signed in as a staff member who holds only the `placement` section.
 *
 * Checks:
 *   CD1 desk queue item confirm sends once and shows the audit line: a double click on the Low confidence item's "Send
 *       booking link" sends ONE action (make_interview) to its review item; the server's message and "Saved to the audit
 *       log at <time> Central." show; the queue is read again and the item has left
 *   CD2 inbox health: Send test with the switch off shows the server's 409 words; "Mark confirmed" only on the learner whose
 *       Gmail confirmation is pending; "Open Gmail confirmation" shows a new-tab Gmail link and the code, and the app stays put
 *   CD3 the sidebar's Placement group has the four desk pages; bookings and fees show the recording notice, the type line,
 *       the KPIs (fees earned, fees pending, the 110% rate from the server); no meeting link anywhere on the desk
 *   CD4 every desk tab fits a phone (390 wide): no horizontal scroll, every button and field 44px or taller
 *   CD5 every desk form control has a label, the current tab is marked aria-current
 *   CDX zero console errors (the one 409 the browser logs for Send test is expected and named)
 *
 * Usage (repo root): node tests/systemV2/career-prep/careerDesk.e2e.js, or runAll.js (env: see harness.js)
 */
const { BASE, NOW, check, tid, shot, runSuite } = require('./harness');
const { installFakeDesk, E1, E2 } = require('./fakeDesk');

const TOKEN = ['e30', Buffer.from(JSON.stringify({ sub: 'desk-e2e', role: 'admin', exp: 4102444800 })).toString('base64url'), 'x'].join('.');
const TABS = ['queue', 'inboxes', 'bookings', 'fees'];

async function deskPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1600, height: 1000 } });
  await ctx.addInitScript(`localStorage.setItem('admin_token', '${TOKEN}');`);
  const page = await ctx.newPage();
  await page.clock.setSystemTime(new Date(NOW));
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const api = await installFakeDesk(page, NOW);
  return { ctx, page, errors, api };
}
const fail = (name, e) => check(name, false, String(e && e.message).split('\n')[0].slice(0, 200));

async function flowQueue(browser) {
  const name = 'CD1 desk queue item confirm sends once and shows the audit line';
  const { ctx, page, errors, api } = await deskPage(browser);
  try {
    await page.goto(`${BASE}/admin/placement/queue`);
    await page.waitForSelector(tid('cdesk-q-act-make_interview'));
    await shot(page, 'desk-queue-1600');
    const before = await page.evaluate(() => ({ title: document.querySelector('[data-testid="cdesk-q-title"]')?.textContent,
      labels: [...document.querySelectorAll('[data-testid="cdesk-q-actions"] button')].map((b) => b.textContent).join('|') }));
    await page.dblclick(tid('cdesk-q-act-make_interview'));
    await page.waitForSelector(tid('cdesk-q-answer-audit'));
    await page.waitForFunction(() => !document.querySelector('[data-testid="cdesk-q-row-item-41"]'));
    const after = await page.evaluate(() => ({ text: document.querySelector('[data-testid="cdesk-q-answer-text"]')?.textContent,
      audit: document.querySelector('[data-testid="cdesk-q-answer-audit"]')?.textContent, next: document.querySelector('[data-testid="cdesk-q-title"]')?.textContent }));
    const posts = api.state.posts.filter((p) => p.path.includes('/review-items/'));
    check(name, before.title === 'Low confidence: is this an interview?' && before.labels === 'Send booking link|Not an interview' && posts.length === 1
      && posts[0].path === '/api/admin/placement/desk/review-items/41/actions' && JSON.stringify(posts[0].body) === '{"action":"make_interview"}'
      && after.text === 'Interview made.' && /^Saved to the audit log at \d{1,2}:\d\d (AM|PM) Central\.$/.test(after.audit || '')
      && after.next === 'No learner matched this email', JSON.stringify({ before, after, posts }));
  } catch (e) { fail(name, e); }
  await ctx.close();
  return errors;
}

async function flowInboxes(browser) {
  const name = 'CD2 inbox health: Send test shows the 409 words; Mark confirmed only while pending; the Gmail link opens in a new tab, never followed';
  const { ctx, page, errors, api } = await deskPage(browser);
  try {
    await page.goto(`${BASE}/admin/placement/inboxes`);
    await page.waitForSelector(tid(`cdesk-in-row-${E1}`));
    await shot(page, 'desk-inboxes-1600');
    const rows = await page.evaluate(([a, b]) => ({ confirmA: !!document.querySelector(`[data-testid="cdesk-in-confirm-${a}"]`), confirmB: !!document.querySelector(`[data-testid="cdesk-in-confirm-${b}"]`) }), [E1, E2]);
    await page.click(tid(`cdesk-in-test-${E1}`));
    await page.waitForSelector(tid('cdesk-in-answer-text'));
    const refused = await page.textContent(tid('cdesk-in-answer-text'));
    const url = page.url();
    await page.click(tid(`cdesk-in-open-${E2}`));
    await page.waitForSelector(tid('cdesk-in-confirm-link'));
    const link = await page.evaluate(() => { const a = document.querySelector('[data-testid="cdesk-in-confirm-link"]'); return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), code: document.querySelector('[data-testid="cdesk-in-confirm-code"]')?.textContent }; });
    const pages = ctx.pages().length;
    check(name, !rows.confirmA && rows.confirmB && refused === 'Inbox tests are switched off' && link.href === 'https://mail-settings.google.com/mail/vf-%5BDESK-E2E%5D'
      && link.target === '_blank' && link.rel === 'noopener noreferrer' && link.code === '987654321' && page.url() === url && pages === 1
      && api.state.posts.filter((p) => p.path.endsWith('/test')).length === 1, JSON.stringify({ rows, refused, link, pages }));
  } catch (e) { fail(name, e); }
  await ctx.close();
  return errors.filter((t) => !/status of 409/.test(t));
}

async function flowPages(browser) {
  const name = 'CD3 the Placement sidebar has the desk pages; bookings and fees show the notice, type line, KPIs and 110%; no meeting link anywhere';
  const { ctx, page, errors, api } = await deskPage(browser);
  try {
    await page.goto(`${BASE}/admin/placement/bookings`);
    await page.waitForSelector(tid('cdesk-bk-recording'));
    await shot(page, 'desk-bookings-1600');
    const nav = await page.evaluate(() => [...document.querySelectorAll('a[href^="/admin/placement/"]')].map((a) => a.getAttribute('href')));
    const bk = await page.evaluate(() => ({ note: document.querySelector('[data-testid="cdesk-bk-recording"]')?.textContent, type: document.querySelector('[data-testid^="cdesk-bk-type-"]')?.textContent }));
    await page.click(tid('cdesk-tab-fees'));
    await page.waitForSelector(tid('cdesk-kpi-pending'));
    await shot(page, 'desk-fees-1600');
    const fees = await page.evaluate(() => ['earned', 'pending', 'rate'].map((k) => document.querySelector(`[data-testid="cdesk-kpi-${k}"]`)?.textContent).join('|'));
    const zoom = await page.evaluate(() => /zoom/i.test([...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').join(' ')));
    const leak = api.sent.some((s) => /room_?url|join_?url|providerEventId|zoom\.us\/j/i.test(JSON.stringify(s.payload)));
    check(name, ['queue', 'inboxes', 'bookings', 'fees'].every((t) => nav.includes(`/admin/placement/${t}`)) && nav.includes('/admin/placement/students')
      && bk.note === 'Recording unavailable: Zoom permission missing' && bk.type === 'Recruiter screen, 30 min, with Pat Doe'
      && fees === 'Accepted · fees earned$118,9761 placement · $0 invoiced · $0 paid|Offers out · fees pending$115,5001 offer|Fee rate110%of first-year salary' && !zoom && !leak,
    JSON.stringify({ nav: [...new Set(nav)], bk, fees, zoom, leak }));
  } catch (e) { fail(name, e); }
  await ctx.close();
  return errors;
}

async function flowPhone(browser) {
  const name = 'CD4 every desk tab fits a phone (390): no horizontal scroll, every button and field 44px or taller';
  const { ctx, page, errors } = await deskPage(browser, { width: 390, height: 844 });
  const out = {};
  try {
    for (const t of TABS) {
      await page.goto(`${BASE}/admin/placement/${t}`);
      await page.waitForSelector('.cdesk .cdesk-card');
      await shot(page, `desk-${t}-390`);
      out[t] = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.cdesk *')].some((el) => el.scrollWidth > el.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX)),
        minH: Math.min(...[...document.querySelectorAll('.cdesk button, .cdesk select, .cdesk input')].map((b) => b.getBoundingClientRect().height)) }));
    }
    check(name, TABS.every((t) => !out[t].wide && out[t].minH >= 44), JSON.stringify(out));
  } catch (e) { fail(name, e); }
  await ctx.close();
  return errors.filter((t) => !/status of 409/.test(t));
}

async function flowLabels(browser) {
  const name = 'CD5 every desk form control has a label; the current tab is aria-current';
  const { ctx, page, errors } = await deskPage(browser);
  const out = {};
  try {
    for (const t of TABS) {
      await page.goto(`${BASE}/admin/placement/${t}`);
      await page.waitForSelector('.cdesk .cdesk-card');
      out[t] = await page.evaluate(() => ({ unlabeled: [...document.querySelectorAll('.cdesk input, .cdesk select')].filter((el) => !el.labels || el.labels.length === 0).map((el) => el.id),
        current: document.querySelector('.cdesk-tabs a[aria-current="page"]')?.getAttribute('href') }));
    }
    check(name, TABS.every((t) => out[t].unlabeled.length === 0 && out[t].current === `/admin/placement/${t}`), JSON.stringify(out));
  } catch (e) { fail(name, e); }
  await ctx.close();
  return errors;
}

runSuite(6, async (browser) => {
  const errs = [...await flowQueue(browser), ...await flowInboxes(browser), ...await flowPages(browser), ...await flowPhone(browser), ...await flowLabels(browser)];
  check('CDX zero console errors in the desk flows (the expected Send test 409 aside)', errs.length === 0, errs.slice(0, 3).join(' | '));
});
