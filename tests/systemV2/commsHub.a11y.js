/**
 * commsHub.a11y.js: the Communications Hub at phone width (CH9.9, the checks phase 1's CH8.2 named).
 *
 * On each hub tab (Today, Events, Compose, Schedule & history) and on the member /portal/events, at
 * 390 px wide:
 *  - nothing is wider than the screen (no sideways scrolling);
 *  - axe-core finds no WCAG 2 A/AA violations;
 *  - every control on a hub tab is at least 44 x 44 px (a checkbox or radio counts with its label,
 *    the area a tap actually hits; links inside running text are exempt, as WCAG exempts them);
 *  - every status badge carries visible text;
 *  - the "Report a problem" button never covers the header's Pause button (also checked at 1280 px).
 * A screenshot of each is saved. An Eventbrite event is managed in the hub first, so the Events tab
 * and /portal/events are checked with real content, not their empty states.
 *
 * LOCAL STACK ONLY, the same stack and fixture variable as commsHubEventbrite.e2e.js. Synthetic data,
 * removed in a finally. Exit 0 = every check passed · 1 = a check failed · 2 = refused / could not set up.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertLocalOnly, checkLocalUrl } = require('./lib/localOnly');

const { base, api } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150', api: process.env.API_URL || 'http://127.0.0.1:3101' });
const DB_URL = process.env.DATABASE_URL || '';
const FIXTURE = process.env.COMMS_HUB_EVENTBRITE_FIXTURE || '';
const dbHost = (() => { try { const u = new URL(DB_URL); return `http://${u.hostname}:${u.port || 5432}`; } catch { return ''; } })();
const refuse = (reason) => { console.error(JSON.stringify({ event: 'comms_hub_a11y_refused', outcome: 'failure', reason })); process.exit(2); };
if (!checkLocalUrl(dbHost).ok || /prod/i.test(DB_URL)) refuse('DATABASE_URL must be a local, non-production database');
if (!process.env.JWT_SECRET || !FIXTURE) refuse('JWT_SECRET and COMMS_HUB_EVENTBRITE_FIXTURE (the backend\'s) are required');

const { chromium } = require(process.env.PW_PATH || 'playwright');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const RUN = crypto.randomBytes(3).toString('hex');
const EID = `97${Math.floor(1e9 + Math.random() * 8e9)}`;
const TITLE = `[e2e] A11y Open House ${RUN}`;
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `commsHub-a11y-${RUN}`);
const TABS = [['today', '/admin/comms-hub'], ['events', '/admin/comms-hub/events'], ['compose', '/admin/comms-hub/compose'], ['schedule', '/admin/comms-hub/schedule']];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const centralWall = (daysOut, hhmm) => `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + daysOut * 86400_000))}T${hhmm}:00Z`;

/** Measured in the page: what overflows, which controls are under 44 x 44, badges without text. */
function measure() {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
  const wide = [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !el.closest('[data-allow-overflow]'))
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().right)}px`);
  const inText = (el) => el.tagName === 'A' && el.closest('p, li, td') && !el.className.includes('btn');
  const small = [...document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], summary')]
    .filter((el) => visible(el) && !inText(el) && el.closest('.comms-hub'))
    .map((el) => {
      let r = el.getBoundingClientRect();
      if (el.type === 'checkbox' || el.type === 'radio') {
        // The tap target is the control and its label together.
        const box = el.closest('.form-check') || (el.id && document.querySelector(`label[for="${el.id}"]`));
        if (box) r = box.getBoundingClientRect();
      }
      return { el, w: r.width, h: r.height };
    })
    .filter((x) => x.w < 44 || x.h < 44)
    .map((x) => `${label(x.el)} ${Math.round(x.w)}x${Math.round(x.h)}`);
  const badges = [...document.querySelectorAll('[data-status]')].filter(visible).filter((el) => !(el.textContent || '').trim()).map((el) => el.getAttribute('data-status'));
  const box = (sel) => { const el = document.querySelector(sel); return el && visible(el) ? el.getBoundingClientRect() : null; };
  const pause = [...document.querySelectorAll('button')].find((b) => /Pause all sending|Resume sending/.test(b.textContent || ''));
  const p = pause ? pause.getBoundingClientRect() : null;
  const rep = box('[data-testid="report-problem-open"]');
  const overlap = !!(p && rep && rep.left < p.right && rep.right > p.left && rep.top < p.bottom && rep.bottom > p.top);
  return { scrollW: document.documentElement.scrollWidth, vw, wide: wide.slice(0, 8), small: small.slice(0, 12), smallCount: small.length, badges, overlap, hasReport: !!rep };
}

/**
 * axe on the whole page. Violations are split by where they are: inside `scope` (the page under test:
 * the hub, or the member Events page) they fail the check; outside it (the shared admin shell, which
 * every admin page has) they are reported, not failed, so a hub check is never blamed for, or allowed
 * to hide, a site-wide issue. Each comes with its elements and, for contrast, the measured colors.
 */
async function axe(page, scope) {
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async (sel) => {
    const out = { inside: [], outside: [] };
    for (const v of (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations) {
      for (const n of v.nodes) {
        const el = document.querySelector(n.target[0]);
        const d = (n.any[0] && n.any[0].data) || {};
        const line = `${v.id}: ${n.target.join(' ')}${d.fgColor ? ` ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}` : ''}`;
        (el && el.closest(sel) ? out.inside : out.outside).push(line);
      }
    }
    return out;
  }, scope);
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  fs.writeFileSync(FIXTURE, JSON.stringify({
    events: [{ EventId: EID, Name: TITLE, Description: 'An accessibility check.', URL: `https://www.eventbrite.com/e/e2e-a11y-${EID}`, StartDate: centralWall(6, '18:30'), EndDate: centralWall(6, '20:00'), Logo_url: null, SignupCount: 1, Status: 'live' }],
    attendees: [{ EventId: EID, AttendeeName: '[e2e] Ada', Email: `a11y-${RUN}@example.invalid`, PhoneNumber: null, OrderId: 1, CreatedDate: centralWall(-1, '10:00') }],
  }));
  const cohortId = (await db.query(`INSERT INTO cohorts (id, name, start_date, core_day, core_time, max_seats, seats_taken, status, created_at)
    VALUES (gen_random_uuid(), $1, CURRENT_DATE, 'Tuesday', '18:00', 50, 0, 'open', now()) RETURNING id`, [`[e2e] A11y cohort ${RUN}`])).rows[0].id;
  const enrollmentId = (await db.query(`INSERT INTO enrollments (id, full_name, email, phone, company, cohort_id, status, portal_enabled)
    VALUES (gen_random_uuid(), '[e2e] Ada', $1, '+12145550100', '[e2e]', $2, 'active', true) RETURNING id`, [`a11y-${RUN}@example.invalid`, cohortId])).rows[0].id;
  const organizerId = crypto.randomUUID();
  const token = jwt.sign({ sub: organizerId, email: 'e2e-organizer@example.invalid', role: 'admin', mgmt_role: 'community_organizer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const member = jwt.sign({ sub: enrollmentId, email: `a11y-${RUN}@example.invalid`, role: 'participant' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  fs.mkdirSync(SHOTS, { recursive: true });
  let hubEventId = null;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });

  try {
    // Manage the Eventbrite event in the hub (wait out the list's two-minute cache), so pages have content.
    for (let i = 0; i < 30 && !hubEventId; i += 1) {
      const r = await fetch(`${api}/api/admin/comms-hub/eventbrite-events/${EID}/adopt`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }); // eslint-disable-line no-await-in-loop
      if (r.ok) hubEventId = (await r.json()).event.id; else await sleep(5000); // eslint-disable-line no-await-in-loop
    }
    check('an Eventbrite event is managed in the hub, so the pages have content', !!hubEventId);

    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height } }); // eslint-disable-line no-await-in-loop
      await ctx.addInitScript((t) => { localStorage.setItem('admin_token', t); }, token); // eslint-disable-line no-await-in-loop
      const page = await ctx.newPage(); // eslint-disable-line no-await-in-loop
      for (const [name, url] of TABS) {
        await page.goto(`${base}${url}`); // eslint-disable-line no-await-in-loop
        await page.locator('.comms-hub').waitFor(); // eslint-disable-line no-await-in-loop
        await page.waitForLoadState('networkidle').catch(() => undefined); // eslint-disable-line no-await-in-loop
        const m = await page.evaluate(measure); // eslint-disable-line no-await-in-loop
        check(`${name} @${width}: Report a problem does not cover Pause`, m.hasReport && !m.overlap);
        if (width !== 390) continue; // eslint-disable-line no-continue
        check(`${name} @390: nothing wider than the screen`, m.scrollW <= m.vw && m.wide.length === 0, m.wide.join('; ') || `${m.scrollW}/${m.vw}`);
        check(`${name} @390: every control is at least 44x44`, m.smallCount === 0, `${m.smallCount}: ${m.small.join('; ')}`);
        check(`${name} @390: status badges carry visible text`, m.badges.length === 0, m.badges.join(', '));
        const v = await axe(page, '.comms-hub'); // eslint-disable-line no-await-in-loop
        check(`${name} @390: axe finds no WCAG A/AA violations in the hub`, v.inside.length === 0, v.inside.slice(0, 4).join(' | '));
        if (v.outside.length) console.log(`  note  ${name} @390: outside the hub (shared admin shell, reported not failed): ${[...new Set(v.outside)].slice(0, 3).join(' | ')}`);
        await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true }); // eslint-disable-line no-await-in-loop
      }
      await ctx.close(); // eslint-disable-line no-await-in-loop
    }

    // The member Events page at 390, with the managed event on it.
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await mctx.addInitScript((t) => { localStorage.setItem('participant_token', t); }, member);
    const mp = await mctx.newPage();
    await mp.goto(`${base}/portal/events`);
    await mp.locator('article').filter({ hasText: TITLE }).first().waitFor({ timeout: 30_000 });
    const pm = await mp.evaluate(measure);
    check('/portal/events @390: the managed event is shown', true);
    check('/portal/events @390: nothing wider than the screen', pm.scrollW <= pm.vw && pm.wide.length === 0, pm.wide.join('; ') || `${pm.scrollW}/${pm.vw}`);
    const pv = await axe(mp, 'body'); // the whole member page must pass
    check('/portal/events @390: axe finds no WCAG A/AA violations', pv.inside.length === 0, pv.inside.slice(0, 4).join(' | '));
    await mp.screenshot({ path: path.join(SHOTS, 'portal-events-390.png'), fullPage: true });
    await mctx.close();
  } catch (err) {
    check('the accessibility run completed', false, `${err.name}: ${String(err.message).split('\n')[0]}`);
  } finally {
    await browser.close();
    const problems = [];
    const step = async (label, sql, args) => { try { await db.query(sql, args); } catch (e) { problems.push(`${label}: ${e.message}`); } };
    if (hubEventId) {
      await step('activity', 'DELETE FROM comms_hub_activity WHERE actor_id = $1 OR entity_id = $2', [organizerId, hubEventId]);
      await step('calendar rows', 'DELETE FROM community_events WHERE hub_event_id = $1', [hubEventId]);
      await step('hub event', 'DELETE FROM comms_hub_events WHERE id = $1', [hubEventId]);
    }
    await step('activity (organizer)', 'DELETE FROM comms_hub_activity WHERE actor_id = $1', [organizerId]);
    await step('enrollment', 'DELETE FROM enrollments WHERE id = $1', [enrollmentId]);
    await step('cohort', 'DELETE FROM cohorts WHERE id = $1', [cohortId]);
    try { fs.writeFileSync(FIXTURE, JSON.stringify({ events: [], attendees: [] })); } catch (e) { problems.push(`fixture: ${e.message}`); }
    const left = (await db.query('SELECT (SELECT count(*) FROM comms_hub_events WHERE ccpp_event_id = $1) + (SELECT count(*) FROM enrollments WHERE id = $2) AS n', [EID, enrollmentId])).rows[0].n;
    check('cleanup removed every row this run made', Number(left) === 0 && problems.length === 0, problems.join('; ') || 'nothing left');
    await db.end();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(JSON.stringify({ event: 'comms_hub_a11y_crashed', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(2); });
