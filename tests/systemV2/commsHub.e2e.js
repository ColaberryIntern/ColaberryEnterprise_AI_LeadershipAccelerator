/**
 * commsHub.e2e.js: the Communications Hub end to end, as Jackie (community_organizer) would use it (CH8.1).
 *
 * 1. Safety controls: set the test cohort.          5. Compose: send to the test cohort as soon as approved, approve.
 * 2. Events: create an event for the test cohort.   6. The sending worker posts it to the test cohort's feed.
 * 3. Thumbnail studio: templates (AI off), use one.  7. Schedule & history shows it Sent.
 * 4. Promotion plan: draft the Announcement.          8. Live panel: Prepare stream (provider stubbed).
 *
 * LOCAL STACK ONLY (tests/systemV2/commsHub-stack.md). Every URL, including the database, must be
 * localhost or the run refuses before doing anything (exit 2). Nothing external is called: the model
 * is tests/systemV2/lib/fakeOpenAI.js, the stream provider is a fake live-input id with no Cloudflare
 * credentials, and no mail transport is configured.
 *
 * It CREATES AND DELETES its own rows: a cohort and an event titled "[e2e] ...", and everything the
 * hub hangs off the event, removed in a finally even on failure. The Colaberry Team identity the hub
 * creates on first post is left (it is the hub's own, created once).
 *
 * Run: BASE_URL=http://localhost:3150 API_URL=http://127.0.0.1:3101 DATABASE_URL=postgres://...@127.0.0.1:55452/chub_stack \
 *      JWT_SECRET=<the backend's> node tests/systemV2/commsHub.e2e.js
 * Exit 0 = every check passed · 1 = a check failed · 2 = refused or could not set up.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertLocalOnly, checkLocalUrl } = require('./lib/localOnly');

const { base, api } = assertLocalOnly({ base: process.env.BASE_URL || 'http://localhost:3150', api: process.env.API_URL || 'http://127.0.0.1:3101' });
const DB_URL = process.env.DATABASE_URL || '';
const dbHost = (() => { try { const u = new URL(DB_URL); return `http://${u.hostname}:${u.port || 5432}`; } catch { return ''; } })();
if (!checkLocalUrl(dbHost).ok || /prod/i.test(DB_URL)) { console.error(JSON.stringify({ event: 'comms_hub_e2e_refused', outcome: 'failure', reason: 'DATABASE_URL must be a local, non-production database' })); process.exit(2); }
if (!process.env.JWT_SECRET) { console.error(JSON.stringify({ event: 'comms_hub_e2e_refused', outcome: 'failure', reason: 'JWT_SECRET (the local backend\'s) is required' })); process.exit(2); }

const { chromium } = require(process.env.PW_PATH || 'playwright');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const RUN = crypto.randomBytes(3).toString('hex');
const COHORT = `[e2e] Comms Hub test cohort ${RUN}`;
const TITLE = `[e2e] Hub walkthrough ${RUN}`;
// Screenshots go outside the repo (tests/systemV2/logs is tracked) unless SHOT_DIR says otherwise.
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `commsHub-e2e-${RUN}`);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

/** The event date: 10 days out (Central), so every promotion-plan step is still in the future. */
function eventDate() {
  const d = new Date(Date.now() + 10 * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  // Hub media (thumbnails, photos) is stored under the 'colaberry-training' brand, which production has and
  // an empty local database does not. Made here only when missing, and removed at the end only if made here.
  let madeTenant = null;
  if (!(await db.query(`SELECT 1 FROM brands WHERE slug = 'colaberry-training'`)).rows.length) {
    madeTenant = (await db.query(`INSERT INTO tenants (slug, name) VALUES ($1, '[e2e] Comms Hub tenant') RETURNING id`, [`comms-hub-e2e-${RUN}`])).rows[0].id;
    await db.query(`INSERT INTO brands (tenant_id, slug, name) VALUES ($1, 'colaberry-training', '[e2e] Colaberry Training')`, [madeTenant]);
  }
  const cohortId = (await db.query(`INSERT INTO cohorts (id, name, start_date, core_day, core_time, max_seats, seats_taken, status, created_at)
    VALUES (gen_random_uuid(), $1, CURRENT_DATE, 'Tuesday', '18:00', 50, 0, 'open', now()) RETURNING id`, [COHORT])).rows[0].id;
  // A fresh organizer id per run: every activity row this run writes as the organizer carries it.
  const organizerId = crypto.randomUUID();
  const token = jwt.sign({ sub: organizerId, email: 'e2e-organizer@example.invalid', role: 'admin', mgmt_role: 'community_organizer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((t) => { localStorage.setItem('admin_token', t); }, token);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }).catch(() => undefined);
  let eventId = null;

  try {
    // 1. Safety controls: the test cohort, set through the page (the only writer of it).
    await page.goto(`${base}/admin/comms-hub/schedule`);
    await page.getByLabel('Test cohort').selectOption({ label: COHORT });
    await page.getByRole('button', { name: 'Save safety controls' }).click();
    await page.getByText('Saved.').waitFor();
    const s = (await db.query('SELECT test_cohort_id FROM comms_hub_settings WHERE id = 1')).rows[0];
    check('the test cohort is set from Safety controls', s && s.test_cohort_id === cohortId);

    // 2. Events: a new event for the test cohort.
    await page.goto(`${base}/admin/comms-hub/events?new=1`);
    await page.getByLabel('Title').fill(TITLE);
    await page.locator('#ch-aud-some').check();
    await page.getByLabel('Cohorts').selectOption({ label: COHORT }).catch(async () => { await page.locator('#ch-cohorts').selectOption({ label: COHORT }); });
    await page.locator('#ch-date').fill(eventDate());
    await page.locator('#ch-start').fill('18:00');
    await page.locator('#ch-end').fill('19:00');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    await page.getByRole('button', { name: 'Generate thumbnails' }).waitFor();
    eventId = (await db.query('SELECT id FROM comms_hub_events WHERE title = $1', [TITLE])).rows[0]?.id ?? null;
    check('the event is created and its editor opens', !!eventId);
    await shot('02-event');

    // 3. Thumbnail studio with AI off: templates, pick one, use it.
    await page.getByRole('button', { name: 'Generate thumbnails' }).click();
    await page.locator('input[name="ch-thumb-option"]').first().waitFor({ state: 'attached', timeout: 60_000 });
    await page.locator('.ch-studio-option label').first().click();
    await page.getByRole('button', { name: 'Use for this event' }).click();
    await page.getByRole('button', { name: 'In use for this event' }).waitFor({ timeout: 30_000 });
    const thumb = (await db.query('SELECT e.thumbnail_id, t.source FROM comms_hub_events e JOIN comms_hub_thumbnails t ON t.id = e.thumbnail_id WHERE e.id = $1', [eventId])).rows[0];
    check('a template thumbnail is generated (AI off) and used for the event', thumb && thumb.source === 'template', thumb ? thumb.source : 'none');
    await shot('03-thumbnail');

    // 4. Promotion plan: draft the Announcement (the model is the local fake).
    await page.locator('#ch-plan-announcement').check();
    await page.getByRole('button', { name: 'Draft these messages' }).click();
    await page.locator('.ch-plan-row').filter({ hasText: 'Announcement' }).getByText(/Draft|Needs approval/).first().waitFor({ timeout: 30_000 });
    const msg = (await db.query(`SELECT id, status FROM comms_hub_messages WHERE event_id = $1 AND plan_kind = 'announcement'`, [eventId])).rows[0];
    check('the promotion plan drafts the Announcement', !!msg, msg ? msg.status : 'none');
    await shot('04-plan');

    // 5. Compose: to the test cohort's feed, as soon as approved; approve.
    await page.goto(`${base}/admin/comms-hub/compose?message=${msg.id}`);
    await page.getByRole('heading', { name: '3. Who gets it, and when' }).waitFor();
    const feed = page.getByLabel(`Community feed: ${COHORT}`);
    if (!(await feed.isChecked())) await feed.check();
    const extra = page.locator('input[id^="ch-to-"]:checked');
    for (let i = (await extra.count()) - 1; i >= 0; i -= 1) {
      const el = extra.nth(i);
      const id = await el.getAttribute('id');
      if (!id.endsWith(`|${cohortId}`) || !id.startsWith('ch-to-community_post')) await el.uncheck(); // eslint-disable-line no-await-in-loop
    }
    const saveRecipients = page.getByRole('button', { name: 'Save recipients' });
    if (await saveRecipients.isVisible()) { await saveRecipients.click(); await saveRecipients.waitFor({ state: 'hidden' }); }
    await page.locator('#ch-when-now').check();
    const saveTime = page.getByRole('button', { name: 'Save the time' });
    if (await saveTime.isVisible()) { await saveTime.click(); await saveTime.waitFor({ state: 'hidden' }); }
    await page.getByRole('button', { name: 'Approve and schedule' }).click();
    await page.getByText(/Approved and scheduled|Sending|Sent/).first().waitFor({ timeout: 30_000 });
    const approved = (await db.query('SELECT status FROM comms_hub_messages WHERE id = $1', [msg.id])).rows[0].status;
    check('the announcement is approved and scheduled', ['scheduled', 'sending', 'sent'].includes(approved), approved);
    const dests = (await db.query('SELECT channel, target_id FROM comms_hub_destinations WHERE message_id = $1', [msg.id])).rows;
    check('it goes only to the test cohort\'s feed', dests.length === 1 && dests[0].target_id === cohortId && dests[0].channel === 'community_post', JSON.stringify(dests));
    await shot('05-approved');

    // 6. The worker (every minute) posts it to the test cohort's feed.
    let status = approved;
    for (let i = 0; i < 48 && status !== 'sent'; i += 1) {
      await new Promise((r) => setTimeout(r, 5000)); // eslint-disable-line no-await-in-loop
      status = (await db.query('SELECT status FROM comms_hub_messages WHERE id = $1', [msg.id])).rows[0].status; // eslint-disable-line no-await-in-loop
    }
    check('the sending worker sends it', status === 'sent', status);
    const posts = (await db.query(`SELECT p.body, p.media_urls FROM community_posts p JOIN comms_hub_deliveries d ON d.provider_message_id = p.id::text
      WHERE d.message_id = $1 AND d.status = 'sent'`, [msg.id])).rows;
    check('one post lands in the test cohort\'s feed, with the date filled in', posts.length === 1 && posts[0].body.includes(TITLE) && !/\{\{/.test(posts[0].body), posts[0] ? posts[0].body.slice(0, 90) : 'none');

    // 7. Schedule & history shows it Sent.
    await page.goto(`${base}/admin/comms-hub/schedule`);
    const row = page.locator('table.ch-history tr').filter({ hasText: TITLE });
    await row.first().waitFor();
    check('Schedule & history shows it Sent', (await row.first().locator('[data-status]').getAttribute('data-status')) === 'sent');
    await shot('07-history');

    // 8. Live panel: Prepare stream, provider stubbed (a fake input id, no Cloudflare credentials).
    // A cohort-only stream needs that cohort's batch room, which a fresh test cohort does not have (the
    // panel refuses with "This cohort has no batch room to stream into."). Streaming to all members
    // needs none, so the event is opened to all members first, as that message suggests.
    await page.goto(`${base}/admin/comms-hub/events?edit=${eventId}`);
    await page.locator('#ch-aud-all').check();
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    await page.getByText(/Saved/).first().waitFor();
    await page.getByRole('button', { name: 'Prepare stream' }).click();
    // Proof is the stream row itself: a refused Prepare writes nothing (livePanel.prepareLive), so no row,
    // or a row in any other state, fails. The panel must also show no refusal (another event holding the
    // shared input reads "... is getting ready to stream right now").
    let occ;
    for (let i = 0; i < 30 && !(occ && occ.editorial_state === 'backstage'); i += 1) {
      await new Promise((r) => setTimeout(r, 1000)); // eslint-disable-line no-await-in-loop
      occ = (await db.query('SELECT o.editorial_state FROM comms_hub_events e JOIN broadcast_occurrences o ON o.id = e.broadcast_occurrence_id WHERE e.id = $1', [eventId])).rows[0]; // eslint-disable-line no-await-in-loop
    }
    const refused = await page.getByText(/getting ready to stream right now|no batch room|could not be prepared/i).count();
    check("Prepare stream puts this event's stream backstage, with no refusal on the panel", !!occ && occ.editorial_state === 'backstage' && refused === 0,
      `${occ ? occ.editorial_state : 'no stream row'}${refused ? `, ${refused} refusal(s) shown` : ''}`);
    await shot('08-live');

    check('no page errors on the way', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('the walkthrough completed', false, `${err.name}: ${String(err.message).split('\n')[0]}`);
    await shot('failure');
  } finally {
    await browser.close();
    // Cleanup, also on failure: everything this run made, child rows first (a database whose tables were
    // created by a model sync has no cascading foreign keys, so nothing is left to the database). A step
    // that fails is logged with its class and fails the cleanup check; nothing is swallowed.
    const problems = [];
    const step = async (label, sql, args) => {
      try { await db.query(sql, args); } catch (e) {
        problems.push(`${label}: ${e.message}`);
        console.error(JSON.stringify({ event: 'comms_hub_e2e_cleanup_failed', outcome: 'failure', step: label, error_class: e.name, message: e.message }));
      }
    };
    const ids = async (label, sql, args) => {
      try { return (await db.query(sql, args)).rows.map((r) => r.id).filter(Boolean); } catch (e) { problems.push(`${label}: ${e.message}`); return []; }
    };
    const msgIds = eventId ? await ids('message ids', 'SELECT id FROM comms_hub_messages WHERE event_id = $1', [eventId]) : [];
    const thumbIds = eventId ? await ids('thumbnail ids', 'SELECT id FROM comms_hub_thumbnails WHERE event_id = $1', [eventId]) : [];
    const occIds = eventId ? await ids('stream ids', 'SELECT broadcast_occurrence_id AS id FROM comms_hub_events WHERE id = $1', [eventId]) : [];
    const touched = [...msgIds, ...thumbIds, ...occIds, ...(eventId ? [eventId] : [])];
    await step('posts', 'DELETE FROM community_posts WHERE id::text IN (SELECT provider_message_id FROM comms_hub_deliveries WHERE message_id = ANY($1::uuid[]) AND provider_message_id IS NOT NULL)', [msgIds]);
    for (const t of ['comms_hub_alerts', 'comms_hub_deliveries', 'comms_hub_approvals', 'comms_hub_drafts', 'comms_hub_destinations']) {
      await step(t, `DELETE FROM ${t} WHERE message_id = ANY($1::uuid[])`, [msgIds]); // eslint-disable-line no-await-in-loop
    }
    await step('activity', 'DELETE FROM comms_hub_activity WHERE entity_id = ANY($1::uuid[]) OR actor_id = $2', [touched, organizerId]);
    await step('messages', 'DELETE FROM comms_hub_messages WHERE id = ANY($1::uuid[])', [msgIds]);
    if (eventId) {
      // The stream preparation holds the one shared live input: left behind, it blocks the next Prepare.
      await step('event links', 'UPDATE comms_hub_events SET thumbnail_id = NULL, broadcast_occurrence_id = NULL WHERE id = $1', [eventId]);
      await step('stream preparation', 'DELETE FROM broadcast_occurrences WHERE id = ANY($1::uuid[])', [occIds]);
      await step('thumbnails', 'DELETE FROM comms_hub_thumbnails WHERE event_id = $1', [eventId]);
      await step('calendar rows', 'DELETE FROM community_events WHERE hub_event_id = $1', [eventId]);
      await step('event', 'DELETE FROM comms_hub_events WHERE id = $1', [eventId]);
    }
    await step('test cohort setting', 'UPDATE comms_hub_settings SET test_cohort_id = NULL WHERE test_cohort_id = $1', [cohortId]);
    await step('cohort', 'DELETE FROM cohorts WHERE id = $1', [cohortId]);
    if (madeTenant) {
      await step('media', 'DELETE FROM media_assets WHERE brand_id IN (SELECT id FROM brands WHERE tenant_id = $1)', [madeTenant]);
      await step('tenant', 'DELETE FROM tenants WHERE id = $1', [madeTenant]);
    }
    try {
      const counts = (await db.query(`SELECT
          (SELECT count(*) FROM comms_hub_events WHERE title LIKE $1) AS events,
          (SELECT count(*) FROM broadcast_occurrences WHERE title LIKE $1) AS streams,
          (SELECT count(*) FROM cohorts WHERE name LIKE $1) AS cohorts,
          (SELECT count(*) FROM comms_hub_messages WHERE id = ANY($2::uuid[])) AS messages,
          (SELECT count(*) FROM comms_hub_deliveries WHERE message_id = ANY($2::uuid[])) AS deliveries,
          (SELECT count(*) FROM comms_hub_drafts WHERE message_id = ANY($2::uuid[])) AS drafts,
          (SELECT count(*) FROM comms_hub_destinations WHERE message_id = ANY($2::uuid[])) AS destinations,
          (SELECT count(*) FROM comms_hub_approvals WHERE message_id = ANY($2::uuid[])) AS approvals,
          (SELECT count(*) FROM comms_hub_alerts WHERE message_id = ANY($2::uuid[])) AS alerts,
          (SELECT count(*) FROM comms_hub_thumbnails WHERE id = ANY($3::uuid[])) AS thumbnails,
          (SELECT count(*) FROM comms_hub_activity WHERE entity_id = ANY($4::uuid[]) OR actor_id = $5) AS activity`,
      [`%${RUN}`, msgIds, thumbIds, touched, organizerId])).rows[0];
      const left = Object.entries(counts).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k} ${n}`);
      const detail = left.length || problems.length ? [...left, ...problems].join('; ') : 'nothing left';
      check('cleanup removed every row this run made', left.length === 0 && problems.length === 0, detail);
    } catch (e) {
      check('cleanup removed every row this run made', false, `${e.name}: ${e.message}`);
    }
    await db.end();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ event: 'comms_hub_e2e_done', outcome: failed.length ? 'failure' : 'success', passed: results.length - failed.length, failed: failed.length, screenshots: SHOTS }));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(JSON.stringify({ event: 'comms_hub_e2e_setup_failed', outcome: 'failure', error_class: err.name, message: err.message })); process.exit(2); });
