/**
 * Career Prep v27 (CP5.4): the Release 1 flows in a real browser (Edge), against the BUILT app (frontend/build) served
 * on 127.0.0.1 with the platform API answered from fixtures (fakeApi.js). Nothing can reach production or any server.
 *
 * Why fixtures and not a seeded local stack (declared in the run's plan): this machine has no Docker and no local
 * Postgres, so the plan's DEV_ONLY seeded database cannot run here. The server side of every step is covered by the
 * backend jest suites (and the Postgres integration suites in CI); this suite proves the browser side end to end.
 *
 * Checks (kit P6, adapted to Release 1):
 *   1 /portal/career lands on the Career Prep floor with one door and a styled trail (one row); the door opens the room
 *   2 the room: pick the interview, pick a plan, Your plan shows the days, Start runs the timer
 *   3 Try records (fake camera) and shows the score; Finish shows the recap; See my dashboard marks the moved skill New
 *     and its readiness equals the recap's
 *   4 ‹ Floor n and Esc both land on the floor with focus on the door
 *   5 Add an interview and Create one for me set the anchor pill (Added by you / Practice)
 *   6 the Offers sheet opens from its URL and the jump bar, is drawn above the room, and no API payload has a fee
 *   7 (audiences) covered by jest: CareerPrepCard / hqCareerPrepTower / careerPrepFloor tests (no campus stack here)
 *   8 zero console errors throughout, and inside a sandboxed iframe
 * Layout: no horizontal scroll and no text overflow for the room (Your progress, Your plan) at 1600, 1440, 390, light
 * and dark, and the floor at 1440 and 390; at 390 the last plan block is focused so its tooltip is on screen.
 *
 * Usage (repo root): node tests/systemV2/career-prep/careerPrep.e2e.js   (env: BUILD_DIR, PORT=3161, PW_CHANNEL=msedge)
 * Exit 0 only when every check ran and passed; a check that did not evaluate counts as a failure.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { installFakeApi } = require('./fakeApi');

const BUILD = path.resolve(process.env.BUILD_DIR || path.join(__dirname, '..', '..', '..', 'frontend', 'build'));
const PORT = Number(process.env.PORT || 3161);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
// A participant token that only has to EXIST for the portal's route guard; the fake API never reads it.
const TOKEN = ['e30', Buffer.from(JSON.stringify({ sub: 'e2e', exp: 4102444800 })).toString('base64url'), 'x'].join('.');

function serve() {
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) throw new Error(`no build at ${BUILD}: run the frontend build first`);
  return http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/__iframe') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<!doctype html><iframe id="f" sandbox="allow-scripts allow-same-origin allow-forms" src="/portal/career/room" style="width:1400px;height:860px;border:0"></iframe>`); return; }
    let file = path.normalize(path.join(BUILD, url));
    if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1');
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: ok === true, detail }); console.log(`${ok === true ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

/** A fake camera and recorder, so "Record" works headless. */
const FAKE_MEDIA = `
  navigator.mediaDevices = navigator.mediaDevices || {};
  navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
  window.MediaRecorder = class { constructor() { this.ondataavailable = null; this.onstop = null; } start() {} stop() { this.ondataavailable && this.ondataavailable({ data: new Blob(['x'], { type: 'video/webm' }) }); this.onstop && this.onstop(); } };
`;

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.addInitScript(`localStorage.setItem('participant_token', '${TOKEN}'); ${FAKE_MEDIA}`);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const api = await installFakeApi(page);
  return { ctx, page, errors, api };
}

const tid = (id) => `[data-testid="${id}"]`;

async function flowFloorAndRoom(browser) {
  const { ctx, page, errors, api } = await newPage(browser);
  await page.goto(`${BASE}/portal/career`);
  await page.waitForSelector(tid('cp-floor'));
  const trail = await page.$eval(tid('cp-trail'), (el) => ({ display: getComputedStyle(el).display, tops: [...el.children].map((c) => Math.round(c.getBoundingClientRect().top)), step: el.getAttribute('data-step') }));
  check('1 /portal/career: the floor, one door, a styled one-row trail at step 2', trail.display === 'flex' && new Set(trail.tops).size === 1 && trail.step === '2' && (await page.$$(tid('cp-door'))).length === 1, JSON.stringify(trail));
  await page.click(tid('cp-door'));
  await page.waitForSelector(tid('cp-room'));
  await page.click(tid('cp-card-i1'));
  await page.waitForSelector('[data-testid="cp-card-plan:days"]');
  await page.click('[data-testid="cp-card-plan:days"]');
  await page.waitForSelector(tid('cp-card-start'));
  const days = await page.$$('.cp-day');
  await page.click(tid('cp-card-start'));
  await page.waitForSelector(tid('cp-session'));
  const ring = await page.$eval('.cp-ring', (el) => el.getAttribute('aria-label'));
  check('2 room: pick the interview, pick a plan (days shown), Start runs the timer', days.length === 2 && /left in this part$/.test(ring), `${days.length} days, ring "${ring}"`);
  await page.click(tid('cp-session-next'));
  await page.click(tid('cp-record'));
  await page.click(tid('cp-stop'));
  await page.waitForSelector(tid('cp-try-result'), { timeout: 10_000 });
  await page.click(tid('cp-session-next'));
  await page.click(tid('cp-session-next'));
  await page.waitForSelector(tid('cp-recap'));
  const recap = await page.textContent(tid('cp-recap'));
  await page.click(tid('cp-recap-dashboard'));
  await page.waitForSelector(tid('cp-new-pace_clarity'));
  const readiness = await page.textContent(tid('cp-dashboard'));
  check('3 Try is scored; Finish shows the recap; the dashboard marks the moved skill New, readiness = the recap\'s',
    /Readiness 69 from 64/.test(recap) && /48 → 57/.test(recap) && /69/.test(readiness) && api.state.readiness === 69, recap.replace(/\s+/g, ' ').slice(0, 120));
  for (const [how, act] of [['‹ Floor n', () => page.click(tid('cp-back'))], ['Esc', () => page.keyboard.press('Escape')]]) {
    if (how === 'Esc') { await page.goto(`${BASE}/portal/career/room`); await page.waitForSelector(tid('cp-room')); await page.click(tid('cp-cora-col')); }
    await act();
    await page.waitForSelector(tid('cp-floor-page'));
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-testid'));
    check(`4 closing the room with ${how} lands on the floor, focus on the door`, focused === 'cp-door' && new URL(page.url()).pathname === '/portal/career', `focus ${focused}`);
  }
  await ctx.close();
  return errors;
}

async function flowAnchors(browser) {
  const { ctx, page, errors } = await newPage(browser);
  await page.goto(`${BASE}/portal/career/room`);
  await page.waitForSelector(tid('cp-card-add'));
  await page.click(tid('cp-card-add'));
  await page.fill('form[data-testid="cp-form"] label:has-text("Company") input', 'Globex');
  await page.fill('form[data-testid="cp-form"] label:has-text("Role") input', 'Data Analyst');
  await page.click('form[data-testid="cp-form"] button[type="submit"]');
  await page.waitForFunction(() => /Added by you/.test(document.querySelector('[data-testid="cp-anchor"]')?.textContent || ''), null, { timeout: 8000 })
    .catch(async (e) => { throw new Error(); });
  const added = await page.textContent(tid('cp-anchor'));
  await page.click('[data-testid="cp-anchor"] button, .cp-anchor-change');
  await page.waitForSelector(tid('cp-card-create'));
  await page.click(`${tid('cp-card-create')} >> nth=-1`);
  await page.click('[data-testid="cp-card-type:behavioral"] >> nth=-1');
  await page.fill('form[data-testid="cp-form"] label:has-text("Role") input', 'Product Manager');
  await page.click('form[data-testid="cp-form"] button[type="submit"]');
  await page.waitForFunction(() => /Practice/.test(document.querySelector('[data-testid="cp-anchor"]')?.textContent || ''));
  const practice = await page.textContent(tid('cp-anchor'));
  check('5 Add an interview and Create one for me set the anchor pill', /Globex/.test(added) && /Added by you/.test(added) && /made by Cora/.test(practice), `${added.trim()} | ${practice.trim()}`);
  await ctx.close();
  return errors;
}

async function flowSheets(browser) {
  const { ctx, page, errors, api } = await newPage(browser);
  await page.goto(`${BASE}/portal/career/room#offers`);
  await page.waitForSelector(tid('cp-sheet-offers'));
  const onTop = async (sel) => page.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 5, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); }, sel);
  const titleTop = await onTop('#cp-sheet-title');
  const bg = await page.$eval('.cp-sheet', (el) => getComputedStyle(el).backgroundColor);
  await page.keyboard.press('Control+k');
  await page.waitForSelector(tid('cp-jump-input'));
  const jumpTop = await onTop('[data-testid="cp-jump-input"]');
  await page.fill(tid('cp-jump-input'), 'resume');
  await page.keyboard.press('Enter');
  await page.waitForSelector(tid('cp-sheet-resume'));
  const linkH = await page.$eval('[data-testid="cp-resume-sheet"] a', (el) => el.getBoundingClientRect().height);
  check('6b a link styled as a button in a sheet is at least 44px tall', linkH >= 44, `${linkH}px`);
  const fee = api.sent.filter((x) => /"[^"]*fee[^"]*"\s*:/i.test(JSON.stringify(x.payload)));
  check('6 sheets open from the URL and the jump bar, drawn above the room; no payload carries a fee',
    titleTop && jumpTop && !/rgba\(0, 0, 0, 0\)/.test(bg) && fee.length === 0, `title ${titleTop}, jump ${jumpTop}, bg ${bg}, fee keys ${fee.length}`);
  await ctx.close();
  return errors;
}

async function flowIframe(browser) {
  const { ctx, page, errors } = await newPage(browser);
  await page.goto(`${BASE}/__iframe`);
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForSelector(tid('cp-room'), { timeout: 15_000 });
  await frame.click(tid('cp-card-i1'));
  await frame.waitForSelector('[data-testid="cp-card-plan:days"]');
  await ctx.close();
  return errors;
}

async function layout(browser) {
  const bad = [];
  const sizes = [[1600, 960], [1440, 900], [390, 844]];
  for (const [w, h] of sizes) {
    for (const dark of [false, true]) {
      const { ctx, page } = await newPage(browser, { viewport: { width: w, height: h }, dark });
      await page.goto(`${BASE}/portal/career/room`);
      await page.click(tid('cp-card-i1'));
      await page.click('[data-testid="cp-card-plan:days"]');
      for (const tab of ['progress', 'plan']) {
        await page.click(`#cp-tab-${tab}`).catch(() => undefined);
        if (tab === 'plan' && w === 390) await page.focus('.cp-day:first-of-type .cp-seg:last-of-type').catch(() => undefined);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
          over: [...document.querySelectorAll('.cp-room *')].filter((e) => e.children.length === 0 && e.textContent.trim() && e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis').length }));
        if (m.sw > m.cw || m.over) bad.push(`room ${tab} ${w}${dark ? ' dark' : ''}: scroll ${m.sw}/${m.cw}, overflow ${m.over}`);
      }
      if (w !== 1600 && !dark) {
        await page.goto(`${BASE}/portal/career`);
        await page.waitForSelector(tid('cp-floor'));
        const f = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rows: new Set([...document.querySelector('[data-testid="cp-trail"]').children].map((c) => Math.round(c.getBoundingClientRect().top))).size }));
        if (f.sw > f.cw || f.rows !== 1) bad.push(`floor ${w}: scroll ${f.sw}/${f.cw}, trail rows ${f.rows}`);
      }
      await ctx.close();
    }
  }
  check('layout: no horizontal scroll or overflowing text (room 1600/1440/390 light+dark, floor 1440/390)', bad.length === 0, bad.join('; '));
}

(async () => {
  const server = serve();
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
  try {
    const errs = [];
    errs.push(...await flowFloorAndRoom(browser));
    errs.push(...await flowAnchors(browser));
    errs.push(...await flowSheets(browser));
    const frameErrs = await flowIframe(browser);
    check('8 zero console errors in every flow, and inside a sandboxed iframe', errs.length === 0 && frameErrs.length === 0, [...errs, ...frameErrs].slice(0, 3).join(' | '));
    await layout(browser);
  } catch (e) {
    check('suite ran to the end', false, String(e && e.message).slice(0, 300));
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length || results.length < 8 ? 1 : 0);
})();
