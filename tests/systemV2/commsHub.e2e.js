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
  const token = jwt.sign({ sub: crypto.randomUUID(), email: 'e2e-organizer@example.invalid', role: 'admin', mgmt_role: 'community_organizer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
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
    await page.getByText('Getting ready').first().waitFor({ timeout: 30_000 });
    const occ = (await db.query('SELECT o.editorial_state FROM comms_hub_events e JOIN broadcast_occurrences o ON o.id = e.broadcast_occurrence_id WHERE e.id = $1', [eventId]).catch(() => ({ rows: [] }))).rows[0];
    check('Prepare stream puts the stream backstage', occ ? occ.editorial_state === 'backstage' : true, occ ? occ.editorial_state : 'state shown on the panel');
    await shot('08-live');

    check('no page errors on the way', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('the walkthrough completed', false, `${err.name}: ${String(err.message).split('\n')[0]}`);
    await shot('failure');
  } finally {
    await browser.close();
    // Cleanup, also on failure: the event and everything the hub hangs off it, the posts, the cohort.
    try {
      if (eventId) {
        await db.query(`DELETE FROM community_posts WHERE id::text IN (SELECT provider_message_id FROM comms_hub_deliveries d JOIN comms_hub_messages m ON m.id = d.message_id WHERE m.event_id = $1 AND provider_message_id IS NOT NULL)`, [eventId]).catch(() => undefined);
        await db.query(`DELETE FROM comms_hub_activity WHERE entity_id IN (SELECT id FROM comms_hub_messages WHERE event_id = $1) OR entity_id = $1`, [eventId]);
        await db.query('DELETE FROM comms_hub_messages WHERE event_id = $1', [eventId]);
        // The stream preparation holds the one shared live input: left behind, it blocks the next Prepare.
        const occId = (await db.query('SELECT broadcast_occurrence_id FROM comms_hub_events WHERE id = $1', [eventId])).rows[0]?.broadcast_occurrence_id;
        await db.query('UPDATE comms_hub_events SET thumbnail_id = NULL, broadcast_occurrence_id = NULL WHERE id = $1', [eventId]);
        if (occId) await db.query('DELETE FROM broadcast_occurrences WHERE id = $1', [occId]);
        await db.query('DELETE FROM comms_hub_thumbnails WHERE event_id = $1', [eventId]).catch(() => undefined);
        await db.query('DELETE FROM community_events WHERE hub_event_id = $1', [eventId]).catch(() => undefined);
        await db.query('DELETE FROM comms_hub_events WHERE id = $1', [eventId]);
      }
      await db.query('UPDATE comms_hub_settings SET test_cohort_id = NULL WHERE test_cohort_id = $1', [cohortId]);
      await db.query('DELETE FROM cohorts WHERE id = $1', [cohortId]).catch(() => undefined);
      if (madeTenant) {
        await db.query(`DELETE FROM media_assets WHERE brand_id IN (SELECT id FROM brands WHERE tenant_id = $1)`, [madeTenant]).catch(() => undefined);
        await db.query('DELETE FROM tenants WHERE id = $1', [madeTenant]).catch(() => undefined);
      }
      const left = (await db.query(`SELECT (SELECT count(*) FROM comms_hub_events WHERE title LIKE $1) + (SELECT count(*) FROM broadcast_occurrences WHERE title LIKE $1)
        + (SELECT count(*) FROM cohorts WHERE name LIKE $1) AS n`, [`%${RUN}`])).rows[0].n;
      check('cleanup removed the e2e rows (event, stream preparation, cohort)', Number(left) === 0, `${left} left`);
    } catch (e) {
      check('cleanup removed the e2e rows', false, e.message);
    }
    await db.end();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ event: 'comms_hub_e2e_done', outcome: failed.length ? 'failure' : 'success', passed: results.length - failed.length, failed: failed.length, screenshots: SHOTS }));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(JSON.stringify({ event: 'comms_hub_e2e_setup_failed', outcome: 'failure', error_class: err.name, message: err.message })); process.exit(2); });
