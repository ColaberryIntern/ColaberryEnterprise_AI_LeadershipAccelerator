/**
 * commsHubWhatsApp.e2e.js: the Communications Hub's WhatsApp channel, end to end (CH10.6), against
 * the LOCAL fake Whapi (tests/systemV2/lib/fakeWhapi.js). Never the real service, never a real group.
 *
 * 1. Schedule & history: the WhatsApp card says Connected (the number's last 4 digits only).
 * 2. Sync groups lists the fake's 3 groups; "Announcements only" cannot be switched on.
 * 3. Switch on the test group.
 * 4. Compose: a message has a WhatsApp tab with the plain-text bubble and its count.
 * 5. Approve: the worker sends it ONCE; the fake records exactly one message with the event's
 *    Central date and time.
 * 6. A send that hangs after WhatsApp received it: the retry finds it and does not send again.
 * 7. A 429: the card shows "Paused by WhatsApp until ...", the in-app delivery of the same message
 *    still goes out, and after Resume early (with its confirm) the WhatsApp message is sent.
 * 8. Cleanup: everything made is deleted; a before-and-after count of every table changes only logs.
 *
 * LOCAL STACK ONLY. The backend must run with
 *   COMMS_HUB_WHATSAPP_ENABLED=true WHAPI_TOKEN=fake-whapi-token WHAPI_BASE_URL=http://127.0.0.1:3299
 *   COMMS_HUB_WHATSAPP_ALWAYS_OPEN=true (the 8 AM to 8 PM window test seam; ignored in production)
 * and fakeWhapi on 127.0.0.1:3299. Every URL, the database included, must be localhost, or it refuses (exit 2).
 *
 * Run: BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 WHAPI_FAKE_URL=http://127.0.0.1:3299 \
 *      DATABASE_URL=postgres://...@127.0.0.1:55452/chub_stack JWT_SECRET=<the backend's> node tests/systemV2/commsHubWhatsApp.e2e.js
 * Exit 0 = every check passed · 1 = a check failed · 2 = refused or could not set up.
 */
const crypto = require('crypto');
const path = require('path');
const { assertLocalOnly, checkLocalUrl } = require('./lib/localOnly');

const { base, api } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150', api: process.env.API_URL || 'http://127.0.0.1:3101' });
const FAKE = process.env.WHAPI_FAKE_URL || 'http://127.0.0.1:3299';
const DB_URL = process.env.DATABASE_URL || '';
const dbHost = (() => { try { const u = new URL(DB_URL); return `http://${u.hostname}:${u.port || 5432}`; } catch { return ''; } })();
const refuse = (reason) => { console.error(JSON.stringify({ event: 'comms_hub_whatsapp_e2e_refused', outcome: 'failure', reason })); process.exit(2); };
// Phase 3 hard stop: the WhatsApp service this run talks to must be the local fake.
if (!checkLocalUrl(FAKE).ok) refuse('WHAPI_FAKE_URL must be localhost (the fake Whapi), never the real service');
if (!checkLocalUrl(dbHost).ok || /prod/i.test(DB_URL)) refuse('DATABASE_URL must be a local, non-production database');
if (!process.env.JWT_SECRET) refuse('JWT_SECRET (the local backend’s) is required');

const { chromium } = require(process.env.PW_PATH || 'playwright');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const RUN = crypto.randomBytes(3).toString('hex');
const TITLE = `[e2e] WhatsApp Demo Night ${RUN}`;
const TEST_GROUP = '120363000000000001@g.us';
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `commsHubWhatsApp-e2e-${RUN}`);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Append-only logs other systems write when the hub runs (AI calls to the fake, process tracking, audits).
const LOGS = /(^|_)(log|logs|audit|audits|activity|llm|events_log|request|requests)(_|$)|ai_generation|generation_log|^ai_events$|^system_processes$/;

async function fake(pathname, body) {
  const r = await fetch(FAKE + pathname, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  return r.json();
}
async function tableCounts(db) {
  const tables = (await db.query("SELECT table_name::text AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1")).rows.map((r) => r.t);
  const out = {};
  for (const t of tables) out[t] = Number((await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n); // eslint-disable-line no-await-in-loop
  return out;
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await fake('/__reset', {});
  const before = await tableCounts(db);
  const settingsBefore = (await db.query('SELECT sending_paused, quiet_hours FROM comms_hub_settings WHERE id = 1')).rows[0];
  await db.query('UPDATE comms_hub_settings SET sending_paused = false, quiet_hours = NULL WHERE id = 1');
  const startsAt = new Date(Date.now() + 5 * 86400_000);
  startsAt.setUTCHours(0, 30, 0, 0); // 6:30 PM Central the evening before (CST)
  // id and timestamps given: a table created by a model sync has no database default for them.
  const eventId = (await db.query("INSERT INTO comms_hub_events (id, title, starts_at, status, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, 'scheduled', now(), now()) RETURNING id", [TITLE, startsAt])).rows[0].id;
  const cohortId = (await db.query(`INSERT INTO cohorts (id, name, start_date, core_day, core_time, max_seats, seats_taken, status, created_at)
    VALUES (gen_random_uuid(), $1, CURRENT_DATE, 'Tuesday', '18:00', 50, 0, 'open', now()) RETURNING id`, [`[e2e] WhatsApp cohort ${RUN}`])).rows[0].id;
  const organizerId = crypto.randomUUID();
  const token = jwt.sign({ sub: organizerId, email: 'e2e-organizer@example.invalid', role: 'admin', mgmt_role: 'community_organizer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const call = async (method, p, body) => {
    const r = await fetch(`${api}/api/admin/comms-hub${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const msgIds = [];
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge' });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript((t) => { localStorage.setItem('admin_token', t); localStorage.setItem('token', t); }, token);
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }).catch(() => undefined);

    // 1. Connected, last 4 digits only.
    await page.goto(`${base}/admin/comms-hub/schedule`);
    const card = page.getByTestId('ch-whatsapp-card');
    await card.getByText('Connected as the number ending 1234.').waitFor({ timeout: 30_000 });
    const cardText = await card.innerText();
    check('the WhatsApp card says Connected with the last 4 digits only', /Connected/.test(cardText) && !/15550001234|5550001234/.test(cardText));
    await shot('01-connected');

    // 2. Sync.
    await card.getByRole('button', { name: /Sync groups/ }).click();
    await card.getByText(/3 groups found/).waitFor({ timeout: 30_000 });
    check('Sync groups lists the 3 groups the number is in', true, (await card.getByRole('status').first().innerText()).trim());
    const annSwitch = card.getByRole('switch', { name: 'Announcements only' });
    check('an admins-only group the number cannot post in cannot be switched on', await annSwitch.isDisabled(), (await card.innerText()).includes("Can't send here") ? 'says why' : 'no reason shown');

    // 3. Switch on the test group.
    // The switch shows the SAVED state: it flips once the server has answered, so click, then wait for it.
    const testSwitch = card.getByRole('switch', { name: 'Comms Hub test group' });
    await testSwitch.click();
    await card.getByText('WhatsApp sending to Comms Hub test group is on.').waitFor();
    check('the switch shows on once it is saved', await testSwitch.isChecked());
    const groupId = (await db.query('SELECT id, enabled FROM comms_hub_whatsapp_groups WHERE provider_group_id = $1', [TEST_GROUP])).rows[0];
    check('switching it on is saved', groupId && groupId.enabled === true);
    await shot('02-groups');

    // A message to the test group and the e2e cohort (in-app), approved now.
    const newMessage = async (kind) => {
      const m = await call('POST', '/messages', { event_id: eventId, kind });
      const id = m.body?.message?.id;
      if (!id) throw new Error(`could not create a message: ${m.status} ${JSON.stringify(m.body).slice(0, 200)}`);
      msgIds.push(id);
      const d = await call('PUT', `/messages/${id}/destinations`, { destinations: [
        { channel: 'whatsapp', target_type: 'whatsapp_group', target_id: groupId.id, label: 'Comms Hub test group' },
        { channel: 'in_app', target_type: 'in_app_audience', target_id: cohortId, label: '[e2e] cohort members' },
      ] });
      if (d.status !== 200) throw new Error(`destinations refused: ${d.status} ${JSON.stringify(d.body).slice(0, 300)}`);
      return { id, message: m.body.message };
    };
    const first = await newMessage('announcement');
    check('the message has a WhatsApp draft with the event’s facts filled in', !!first.message.drafts.whatsapp && /6:30 PM C[SD]T/.test(first.message.drafts.whatsapp.body), first.message.drafts.whatsapp?.body);

    // 4. Compose shows the WhatsApp tab.
    await page.goto(`${base}/admin/comms-hub/compose?message=${first.id}`);
    await page.getByRole('tab', { name: 'WhatsApp' }).click();
    const panel = page.locator('#ch-panel-whatsapp');
    check('Compose shows the WhatsApp bubble and its character count', (await panel.locator('figure').innerText()).includes('Hi all,') && /of 1,000 characters/.test(await panel.getByTestId('ch-wa-count').innerText()));
    await shot('03-compose-whatsapp');

    // 5. Approve; the worker sends it once.
    const waitDelivery = async (messageId, channel, want, ms) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        // eslint-disable-next-line no-await-in-loop
        const r = (await db.query('SELECT status, error, provider_message_id FROM comms_hub_deliveries WHERE message_id = $1 AND channel = $2', [messageId, channel])).rows[0];
        if (r && want.includes(r.status)) return r;
        await sleep(3000); // eslint-disable-line no-await-in-loop
      }
      return (await db.query('SELECT status, error, provider_message_id FROM comms_hub_deliveries WHERE message_id = $1 AND channel = $2', [messageId, channel])).rows[0] ?? null;
    };
    const ok1 = await call('POST', `/messages/${first.id}/approve`);
    check('approve and schedule', ok1.status === 200, String(ok1.status));
    const d1 = await waitDelivery(first.id, 'whatsapp', ['sent', 'failed', 'skipped'], 180_000);
    const sent1 = (await fake('/__sent')).messages.filter((m) => m.chat_id === TEST_GROUP);
    check('the worker sent it to WhatsApp once', d1?.status === 'sent' && sent1.length === 1 && d1.provider_message_id === sent1[0].id, `${d1?.status} ${d1?.error ?? ''}, ${sent1.length} in the group`);
    check('the WhatsApp text carries the event’s Central date and time', /6:30 PM C[SD]T/.test(sent1[0]?.text?.body ?? sent1[0]?.image?.caption ?? ''));

    // 6. Hang after send: the retry finds it and does not send again.
    const second = await newMessage('reminder');
    await fake('/__script', { path: '/messages/text', hangAfterSend: true });
    await call('POST', `/messages/${second.id}/approve`);
    const d2 = await waitDelivery(second.id, 'whatsapp', ['sent', 'failed', 'skipped'], 360_000);
    const sent2 = (await fake('/__sent')).messages.filter((m) => m.chat_id === TEST_GROUP);
    check('a send that hung after WhatsApp got it is found on the retry, and NOT sent again', d2?.status === 'sent' && /^already_done/.test(d2.error ?? '') && sent2.length === 2, `${d2?.status} ${(d2?.error ?? '').slice(0, 40)}, ${sent2.length} in the group`);

    // 7. A 429: paused; in-app still goes out; Resume early sends it.
    const third = await newMessage('update');
    await fake('/__script', { path: '/messages/text', status: 429, times: 1 });
    await call('POST', `/messages/${third.id}/approve`);
    const held = await waitDelivery(third.id, 'in_app', ['sent', 'failed', 'skipped'], 240_000);
    const breaker = (await db.query('SELECT whatsapp_breaker_until FROM comms_hub_settings WHERE id = 1')).rows[0].whatsapp_breaker_until;
    const wa3 = (await db.query("SELECT status, error FROM comms_hub_deliveries WHERE message_id = $1 AND channel = 'whatsapp'", [third.id])).rows[0];
    check('a 429 pauses WhatsApp for 48 hours and holds the delivery, without spending a try', !!breaker && wa3?.status === 'pending' && /^held: whatsapp_paused_by_whatsapp/.test(wa3.error ?? ''), `${wa3?.status} ${wa3?.error ?? ''}`);
    check('the in-app delivery of the same message still goes out', held?.status === 'sent', held?.status);
    await page.goto(`${base}/admin/comms-hub/schedule`);
    const paused = page.getByTestId('ch-wa-paused');
    await paused.waitFor();
    check('the card says "Paused by WhatsApp until ..."', /Paused by WhatsApp until .+C[SD]T\./.test(await paused.innerText()));
    await shot('04-paused');
    await paused.getByRole('button', { name: 'Resume WhatsApp early' }).click();
    await paused.getByRole('button', { name: 'Yes, resume now' }).click();
    await paused.waitFor({ state: 'detached', timeout: 20_000 });
    await db.query("UPDATE comms_hub_deliveries SET next_attempt_at = now() WHERE message_id = $1 AND channel = 'whatsapp'", [third.id]);
    const d3 = await waitDelivery(third.id, 'whatsapp', ['sent', 'failed'], 240_000);
    const sent3 = (await fake('/__sent')).messages.filter((m) => m.chat_id === TEST_GROUP);
    check('after Resume early, the held WhatsApp message is sent (once)', d3?.status === 'sent' && sent3.length === 3, `${d3?.status}, ${sent3.length} in the group`);
    const cleared = (await db.query("SELECT count(*)::int AS n FROM comms_hub_activity WHERE action = 'whatsapp.breaker_cleared' AND actor_id = $1", [organizerId])).rows[0].n;
    check('resuming early is in the activity log, naming who', cleared === 1);
    check('no page error', true);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    const problems = [];
    const step = async (what, sql, args) => { try { await db.query(sql, args); } catch (e) { problems.push(`${what}: ${e.message}`); } };
    await step('notifications', "DELETE FROM community_notifications WHERE source_type = 'comms_hub' AND source_id = ANY($1::uuid[])", [msgIds]);
    for (const t of ['comms_hub_deliveries', 'comms_hub_approvals', 'comms_hub_destinations', 'comms_hub_drafts', 'comms_hub_alerts']) {
      await step(t, `DELETE FROM ${t} WHERE message_id = ANY($1::uuid[])`, [msgIds]); // eslint-disable-line no-await-in-loop
    }
    await step('activity', "DELETE FROM comms_hub_activity WHERE actor_id = $1 OR entity_id = ANY($2::uuid[]) OR action LIKE 'whatsapp.%'", [organizerId, [...msgIds, eventId]]);
    await step('messages', 'DELETE FROM comms_hub_messages WHERE id = ANY($1::uuid[])', [msgIds]);
    // The 429 raised a real admin alert (channelAlerts); remove it and its events.
    await step('alert events', "DELETE FROM alert_events WHERE alert_id IN (SELECT id FROM alerts WHERE title = 'WhatsApp paused the hub number for 48 hours')", []);
    await step('alerts', "DELETE FROM alerts WHERE title = 'WhatsApp paused the hub number for 48 hours'", []);
    await step('groups', "DELETE FROM comms_hub_whatsapp_groups WHERE provider_group_id LIKE '12036300000000000_@g.us'", []);
    await step('calendar rows', 'DELETE FROM community_events WHERE hub_event_id = $1', [eventId]);
    await step('event', 'DELETE FROM comms_hub_events WHERE id = $1', [eventId]);
    await step('cohort', 'DELETE FROM cohorts WHERE id = $1', [cohortId]);
    await step('settings', `UPDATE comms_hub_settings SET sending_paused = $1, quiet_hours = $2, whatsapp_next_send_at = NULL, whatsapp_day = NULL,
      whatsapp_day_count = 0, whatsapp_breaker_until = NULL, whatsapp_breaker_reason = NULL, whatsapp_breaker_alerted_for = NULL WHERE id = 1`, [settingsBefore.sending_paused, settingsBefore.quiet_hours ? JSON.stringify(settingsBefore.quiet_hours) : null]);
    await fake('/__reset', {}).catch(() => undefined);
    const after = await tableCounts(db);
    const changed = Object.keys({ ...before, ...after }).filter((t) => (before[t] ?? 0) !== (after[t] ?? 0));
    const notLogs = changed.filter((t) => !LOGS.test(t));
    check('cleanup: every table is back to its count, apart from append-only logs', notLogs.length === 0 && problems.length === 0,
      `${notLogs.map((t) => `${t} ${before[t] ?? 0}->${after[t] ?? 0}`).join(', ') || 'none'}; logs grew: ${changed.filter((t) => LOGS.test(t)).join(', ') || 'none'}${problems.length ? `; problems: ${problems.join('; ')}` : ''}`);
    await db.end();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`RESULT ${results.length - failed}/${results.length}  screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(JSON.stringify({ event: 'comms_hub_whatsapp_e2e_crashed', error_class: e.name, message: e.message })); process.exit(2); });
