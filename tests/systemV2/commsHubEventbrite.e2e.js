/**
 * commsHubEventbrite.e2e.js: the Communications Hub's phase 2, end to end, as Jackie would use it (CH9.9).
 *
 * 1. Events tab: "From Eventbrite" lists a (synthetic) Eventbrite event.
 * 2. View registrants: one row per person across Eventbrite and our site; who has an account.
 * 3. Download CSV: the file's headers and rows; every view and download is in the activity log.
 * 4. Manage in the hub: one hub event, its editor opens with the Eventbrite fields locked.
 * 5. Compose: the event's registrants are offered with how many it reaches; approved, sent now.
 * 6. The sending worker notifies the registrant who has a platform account, in the app.
 * 7. Report a problem: posts to the hub's own endpoint (not Marketing's).
 * 8. The member Events page shows the managed event.
 *
 * LOCAL STACK ONLY (tests/systemV2/commsHub-stack.md, section "Phase 2"). The backend must be started
 * with COMMS_HUB_EVENTBRITE_FIXTURE=<path> and NODE_ENV not production; this script writes that file.
 * Every URL, including the database, must be localhost or it refuses (exit 2). Nothing external is
 * called. All people are synthetic (@example.invalid). Everything it makes is deleted in a finally.
 *
 * Run: BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 DATABASE_URL=postgres://...@127.0.0.1:55452/chub_stack \
 *      JWT_SECRET=<the backend's> COMMS_HUB_EVENTBRITE_FIXTURE=<same path as the backend> node tests/systemV2/commsHubEventbrite.e2e.js
 * Exit 0 = every check passed · 1 = a check failed · 2 = refused or could not set up.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertLocalOnly, checkLocalUrl } = require('./lib/localOnly');
const { sweepEnrollment, countLeft } = require('./lib/enrollmentSweep');

const { base, api } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150', api: process.env.API_URL || 'http://127.0.0.1:3101' });
const DB_URL = process.env.DATABASE_URL || '';
const FIXTURE = process.env.COMMS_HUB_EVENTBRITE_FIXTURE || '';
const dbHost = (() => { try { const u = new URL(DB_URL); return `http://${u.hostname}:${u.port || 5432}`; } catch { return ''; } })();
const refuse = (reason) => { console.error(JSON.stringify({ event: 'comms_hub_eventbrite_e2e_refused', outcome: 'failure', reason })); process.exit(2); };
if (!checkLocalUrl(dbHost).ok || /prod/i.test(DB_URL)) refuse('DATABASE_URL must be a local, non-production database');
if (!process.env.JWT_SECRET) refuse('JWT_SECRET (the local backend\'s) is required');
if (!FIXTURE) refuse('COMMS_HUB_EVENTBRITE_FIXTURE (the same path the backend was started with) is required');

const { chromium } = require(process.env.PW_PATH || 'playwright');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const RUN = crypto.randomBytes(3).toString('hex');
const EID = `98${Math.floor(1e9 + Math.random() * 8e9)}`;
const TITLE = `[e2e] Eventbrite Open House ${RUN}`;
const A = `a-${RUN}@example.invalid`; // on Eventbrite twice (two orders), and has a platform account
const B = `b-${RUN}@example.invalid`; // on Eventbrite, stored the CCPP way ('x@y',)
const C = `c-${RUN}@example.invalid`; // registered on our site only
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `commsHubEventbrite-e2e-${RUN}`);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CCPP stores Central wall-clock time; the fixture uses the same shape (read as UTC by the driver). */
function centralWall(daysOut, hhmm) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + daysOut * 86400_000));
  return `${day}T${hhmm}:00Z`;
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  fs.writeFileSync(FIXTURE, JSON.stringify({
    events: [{ EventId: EID, Name: TITLE, Description: 'See what builders shipped this month.', URL: `https://www.eventbrite.com/e/e2e-open-house-${EID}`,
      StartDate: centralWall(5, '18:30'), EndDate: centralWall(5, '20:00'), Logo_url: null, SignupCount: 2, Status: 'live' }],
    attendees: [
      { EventId: EID, AttendeeName: '[e2e] Ada', Email: A, PhoneNumber: '+1 214 555 0100', OrderId: 1, CreatedDate: centralWall(-3, '10:00') },
      { EventId: EID, AttendeeName: '[e2e] Ada', Email: A, PhoneNumber: null, OrderId: 2, CreatedDate: centralWall(-2, '10:00') },
      { EventId: EID, AttendeeName: "'[e2e] Bea',", Email: `'${B}',`, PhoneNumber: null, OrderId: 3, CreatedDate: centralWall(-1, '10:00') },
    ],
  }));
  const cohortId = (await db.query(`INSERT INTO cohorts (id, name, start_date, core_day, core_time, max_seats, seats_taken, status, created_at)
    VALUES (gen_random_uuid(), $1, CURRENT_DATE, 'Tuesday', '18:00', 50, 0, 'open', now()) RETURNING id`, [`[e2e] Eventbrite cohort ${RUN}`])).rows[0].id;
  // A phone number, or the portal stops at "Add your phone number" (PortalPhoneGate) before any page.
  const enrollmentId = (await db.query(`INSERT INTO enrollments (id, full_name, email, phone, company, cohort_id, status, portal_enabled)
    VALUES (gen_random_uuid(), '[e2e] Ada', $1, '+12145550100', '[e2e]', $2, 'active', true) RETURNING id`, [A, cohortId])).rows[0].id;
  const memberId = (await db.query(`INSERT INTO community_members (id, enrollment_id, display_name, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, '[e2e] Ada', now(), now()) RETURNING id`, [enrollmentId])).rows[0].id;
  await db.query(`INSERT INTO open_house_registrations (event_id, email_lower, name, source) VALUES ($1, $2, '[e2e] Cy', 'e2e')`, [EID, C]);

  const organizerId = crypto.randomUUID();
  const token = jwt.sign({ sub: organizerId, email: 'e2e-organizer@example.invalid', role: 'admin', mgmt_role: 'community_organizer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (method, p, body) => { const r = await fetch(`${api}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, headers: r.headers, text: await r.text() }; };
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await context.addInitScript((t) => { localStorage.setItem('admin_token', t); }, token);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }).catch(() => undefined);
  let hubEventId = null;
  let msgId = null;

  try {
    // The list is cached for two minutes; wait until this run's event is in it.
    let listed = false;
    for (let i = 0; i < 30 && !listed; i += 1) {
      const r = await call('GET', '/api/admin/comms-hub/eventbrite-events?window=upcoming'); // eslint-disable-line no-await-in-loop
      listed = r.status === 200 && JSON.parse(r.text).events.some((e) => e.ccpp_event_id === EID);
      if (!listed) await sleep(5000); // eslint-disable-line no-await-in-loop
    }
    // 1. The Events tab lists it under "From Eventbrite".
    await page.goto(`${base}/admin/comms-hub/events`);
    const card = page.locator('article').filter({ hasText: TITLE });
    await card.first().waitFor({ timeout: 30_000 });
    // textContent, not innerText: the label is styled uppercase, and innerText returns what is painted.
    check('the Events tab lists the Eventbrite event under "From Eventbrite"', listed && ((await card.first().textContent()) ?? '').includes('From Eventbrite'), listed ? 'listed' : 'not in the list');
    await shot('01-eventbrite-list');

    // 2. View registrants: A (two orders) once, B unwrapped, C from our site; A has an account.
    await card.first().getByRole('button', { name: /View registrants/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('registrants-count').waitFor();
    const rows = await dialog.locator('tbody tr').allInnerTexts();
    check('registrants: one row per person across Eventbrite and our site, CCPP emails cleaned', rows.length === 3 && [A, B, C].every((e) => rows.some((r) => r.includes(e))), `${rows.length} rows`);
    check('who has a platform account is shown', rows.some((r) => r.includes(A) && /Yes\s*$/.test(r.trim())) && rows.some((r) => r.includes(C) && /No\s*$/.test(r.trim())));
    check('no phone number on screen', !(await dialog.innerText()).includes('555 0100'));
    await shot('02-registrants');

    // 3. Download CSV (the browser download, then the route's headers), and the activity log.
    const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Download CSV/ }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('the download is the registrants CSV, phone included', dl.suggestedFilename().startsWith('registrants-') && csv.includes('Name,Email,Phone,Registered (Central),Source,Has platform account') && csv.includes("'+1 214 555 0100") && csv.trim().split('\r\n').length === 4, dl.suggestedFilename());
    const head = await call('GET', `/api/admin/comms-hub/eventbrite-events/${EID}/registrants.csv`);
    check('the CSV route answers text/csv, attachment, no-store', head.status === 200 && /text\/csv/.test(head.headers.get('content-type')) && /attachment/.test(head.headers.get('content-disposition')) && head.headers.get('cache-control') === 'no-store');
    const audit = (await db.query(`SELECT action, detail FROM comms_hub_activity WHERE actor_id = $1 AND entity_type = 'eventbrite_event'`, [organizerId])).rows;
    check('every view and download is in the activity log, with no person in it', audit.some((a) => a.action === 'registrants.viewed') && audit.some((a) => a.action === 'registrants.exported') && !JSON.stringify(audit).includes(A), `${audit.length} rows`);
    await dialog.getByRole('button', { name: 'Close' }).click();

    // 4. Manage in the hub: one hub event; its editor opens with the Eventbrite fields locked.
    await card.first().getByRole('button', { name: /Manage in the hub/ }).click();
    await page.getByTestId('ch-from-eventbrite').waitFor({ timeout: 30_000 });
    hubEventId = (await db.query('SELECT id FROM comms_hub_events WHERE ccpp_event_id = $1', [EID])).rows[0]?.id ?? null;
    const again = await call('POST', `/api/admin/comms-hub/eventbrite-events/${EID}/adopt`);
    const n = (await db.query('SELECT count(*)::int AS n FROM comms_hub_events WHERE ccpp_event_id = $1', [EID])).rows[0].n;
    check('Manage in the hub makes one hub event, and adopting again finds it (200)', !!hubEventId && n === 1 && again.status === 200, `rows ${n}, again ${again.status}`);
    check('the editor locks the Eventbrite title', await page.locator('#ch-title').evaluate((el) => el.readOnly));
    await shot('04-managed');

    // 5. Compose: a plan Announcement, to the registrants only, sent now, approved.
    await page.locator('#ch-plan-announcement').check();
    await page.getByRole('button', { name: 'Draft these messages' }).click();
    await page.locator('.ch-plan-row').filter({ hasText: 'Announcement' }).getByText(/Draft|Needs approval/).first().waitFor({ timeout: 30_000 });
    msgId = (await db.query(`SELECT id FROM comms_hub_messages WHERE event_id = $1 AND plan_kind = 'announcement'`, [hubEventId])).rows[0]?.id;
    await page.goto(`${base}/admin/comms-hub/compose?message=${msgId}`);
    await page.getByRole('heading', { name: '3. Who gets it, and when' }).waitFor();
    const regBox = page.locator(`input[id="ch-to-in_app|event_registrants|${hubEventId}"]`);
    await regBox.waitFor();
    const reach = await page.getByTestId('ch-registrant-reach').innerText();
    check('Compose offers the registrants, with how many it reaches', /1 of 3 registrants have a platform account/.test(reach), reach);
    const boxes = page.locator('input[id^="ch-to-"]');
    for (let i = 0; i < await boxes.count(); i += 1) { // eslint-disable-line no-await-in-loop
      const b = boxes.nth(i);
      const want = (await b.getAttribute('id')) === `ch-to-in_app|event_registrants|${hubEventId}`; // eslint-disable-line no-await-in-loop
      if ((await b.isChecked()) !== want) await b.setChecked(want); // eslint-disable-line no-await-in-loop
    }
    const save = page.getByRole('button', { name: 'Save recipients' });
    if (await save.isVisible()) { await save.click(); await save.waitFor({ state: 'hidden' }); }
    await page.locator('#ch-when-now').check();
    const saveTime = page.getByRole('button', { name: 'Save the time' });
    if (await saveTime.isVisible()) { await saveTime.click(); await saveTime.waitFor({ state: 'hidden' }); }
    await page.getByRole('button', { name: 'Approve and schedule' }).click();
    await page.getByText(/Approved and scheduled|Sending|Sent/).first().waitFor({ timeout: 30_000 });
    const dests = (await db.query('SELECT channel, target_type, target_id FROM comms_hub_destinations WHERE message_id = $1', [msgId])).rows;
    check('it goes only to the event\'s registrants, in the app', dests.length === 1 && dests[0].target_type === 'event_registrants' && dests[0].target_id === hubEventId, JSON.stringify(dests));
    await shot('05-compose');

    // 6. The worker notifies the registrant with an account (A), once.
    let status = '';
    for (let i = 0; i < 48 && status !== 'sent'; i += 1) {
      await sleep(5000); // eslint-disable-line no-await-in-loop
      status = (await db.query('SELECT status FROM comms_hub_messages WHERE id = $1', [msgId])).rows[0].status; // eslint-disable-line no-await-in-loop
    }
    const notes = (await db.query(`SELECT member_id FROM community_notifications WHERE source_type = 'comms_hub' AND source_id = $1`, [msgId])).rows;
    check('the worker notifies exactly the registrant who has an account', status === 'sent' && notes.length === 1 && notes[0].member_id === memberId, `${status}, ${notes.length} notified`);

    // 7. Report a problem: the hub's own endpoint. Locally there is no mail transport, so it is refused
    //    or not delivered, and the page says so; what matters here is WHERE it went.
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/bug-report$/.test(new URL(r.url()).pathname)),
      (async () => {
        await page.getByTestId('report-problem-open').click();
        await page.getByTestId('bug-summary').fill('[e2e] registrants check');
        await page.getByTestId('bug-happened').fill('Opened the registrants of the e2e event to check the list.');
        await page.getByTestId('bug-send').click();
      })(),
    ]);
    check('Report a problem posts to the hub\'s own endpoint, not Marketing\'s', new URL(resp.url()).pathname === '/api/admin/comms-hub/bug-report', `${resp.status()}`);
    // No recipients are configured locally: the hub answers 503, and the page says so in plain words.
    const said = await page.getByTestId('report-problem-error').innerText().catch(() => '');
    check('with no recipients set up, it answers 503 and the page tells the person to tell Ali', resp.status() === 503 && /No one is set up to receive problem reports yet\. Tell Ali directly\./.test(said), `${resp.status()}: ${said}`);

    // 8. The member Events page shows the managed event (the hub card, with its Eventbrite Sign up).
    const member = jwt.sign({ sub: enrollmentId, email: A, role: 'participant' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const mpage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await mpage.addInitScript((t) => { localStorage.setItem('participant_token', t); }, member);
    await mpage.goto(`${base}/portal/events`);
    const mcard = mpage.locator('article').filter({ hasText: TITLE });
    await mcard.first().waitFor({ timeout: 30_000 }).catch(() => undefined);
    check('the member Events page shows the managed event', (await mcard.count()) === 1);
    await mpage.screenshot({ path: path.join(SHOTS, '08-portal-events.png'), fullPage: true }).catch(() => undefined);
    await mpage.close();

    check('no page errors on the way', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('the walkthrough completed', false, `${err.name}: ${String(err.message).split('\n')[0]}`);
    await shot('failure');
  } finally {
    await browser.close();
    const problems = [];
    const step = async (label, sql, args) => {
      try { await db.query(sql, args); } catch (e) {
        problems.push(`${label}: ${e.message}`);
        console.error(JSON.stringify({ event: 'comms_hub_eventbrite_e2e_cleanup_failed', outcome: 'failure', step: label, error_class: e.name, message: e.message }));
      }
    };
    const msgIds = hubEventId ? (await db.query('SELECT id FROM comms_hub_messages WHERE event_id = $1', [hubEventId]).catch(() => ({ rows: [] }))).rows.map((r) => r.id) : [];
    await step('notifications', `DELETE FROM community_notifications WHERE source_type = 'comms_hub' AND source_id = ANY($1::uuid[])`, [msgIds]);
    for (const t of ['comms_hub_alerts', 'comms_hub_deliveries', 'comms_hub_approvals', 'comms_hub_drafts', 'comms_hub_destinations']) {
      await step(t, `DELETE FROM ${t} WHERE message_id = ANY($1::uuid[])`, [msgIds]); // eslint-disable-line no-await-in-loop
    }
    await step('activity', 'DELETE FROM comms_hub_activity WHERE actor_id = $1 OR entity_id = ANY($2::uuid[])', [organizerId, [...msgIds, ...(hubEventId ? [hubEventId] : [])]]);
    await step('messages', 'DELETE FROM comms_hub_messages WHERE id = ANY($1::uuid[])', [msgIds]);
    if (hubEventId) {
      await step('calendar rows', 'DELETE FROM community_events WHERE hub_event_id = $1', [hubEventId]);
      await step('hub event', 'DELETE FROM comms_hub_events WHERE id = $1', [hubEventId]);
    }
    // The reports table is created on the first stored report; with no recipients locally, none was stored.
    await step('bug reports', `DO $$ BEGIN IF to_regclass('public.marketing_bug_reports') IS NOT NULL THEN
      DELETE FROM marketing_bug_reports WHERE summary = '[e2e] registrants check'; END IF; END $$`, []);
    await step('our-site registration', 'DELETE FROM open_house_registrations WHERE event_id = $1', [EID]);
    // Every row the test member left anywhere (the portal visit writes presence, room visits, level...),
    // found by column rather than listed, then the enrollment itself.
    await sweepEnrollment(db, enrollmentId, problems);
    await step('cohort', 'DELETE FROM cohorts WHERE id = $1', [cohortId]);
    try { fs.writeFileSync(FIXTURE, JSON.stringify({ events: [], attendees: [] })); } catch (e) { problems.push(`fixture: ${e.message}`); }
    const left = (await db.query(`SELECT
        (SELECT count(*) FROM comms_hub_events WHERE ccpp_event_id = $1) AS events,
        (SELECT count(*) FROM comms_hub_messages WHERE id = ANY($2::uuid[])) AS messages,
        (SELECT count(*) FROM community_notifications WHERE source_id = ANY($2::uuid[])) AS notifications,
        (SELECT count(*) FROM comms_hub_activity WHERE actor_id = $3) AS activity,
        (SELECT count(*) FROM open_house_registrations WHERE event_id = $1) AS registrations,
        (SELECT count(*) FROM enrollments WHERE email = $4) AS enrollments`, [EID, msgIds, organizerId, A])).rows[0];
    const remaining = [...Object.entries(left).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${v}`), ...await countLeft(db, enrollmentId),
      ...((await db.query('SELECT count(*)::int AS n FROM cohorts WHERE id = $1', [cohortId])).rows[0].n ? ['cohorts 1'] : [])];
    // Said precisely: the backend's append-only logs (audit_logs, ai_events, content_generation_logs)
    // keep their rows by design. Everything else this run made, including every row tied to the test
    // member in any table, is gone and counted here.
    check('cleanup removed every row this run made, except the backend\'s append-only logs', remaining.length === 0 && problems.length === 0, [...remaining, ...problems].join('; ') || 'nothing left');
    await db.end();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(JSON.stringify({ event: 'comms_hub_eventbrite_e2e_crashed', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(2); });
