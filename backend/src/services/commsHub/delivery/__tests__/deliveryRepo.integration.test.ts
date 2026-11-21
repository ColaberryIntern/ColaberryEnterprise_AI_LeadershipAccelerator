/**
 * CH7.2 on a real Postgres (scratch database): the claim really is FOR UPDATE SKIP LOCKED (two
 * workers at once never take the same row, and a row another transaction holds is skipped); a row
 * left `sending` past the lease is reclaimed with its first claim kept; the send lock serializes two
 * messages to one feed; and a whole tick, start to result, with a recording channel.
 *
 * The schema is built by the hub's own ensureCommsHubSchema (production DDL, not a model sync), on a
 * stub community_events table it alters. Runs in CI's integration tier (scripts/ci/runIntegrationSuites.js
 * gives it its own database). Locally:
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=ci postgres:16-alpine
 *   DATABASE_URL=postgres://ci@127.0.0.1:55432/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub/delivery
 * NEVER point it at production: it creates and drops tables.
 */
import { QueryTypes } from 'sequelize';
import type { Connector, ConnectorDelivery } from '../../connectors/types';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub deliveryRepo.integration] SKIPPED: no DATABASE_URL. Not evidence that the claim, lease or send lock hold in Postgres, unless it ran.');
}

describeIfDb('CH7.2 sending worker on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let repo: typeof import('../deliveryRepo').deliveryRepo;
  let runDeliveryTick: typeof import('../deliveryWorker').runDeliveryTick;
  let approvalHash: typeof import('../../messages/messageStatus').approvalHash;
  let loadContent: typeof import('../../messages/approvals').loadContent;
  const NOW = new Date('2026-11-20T16:00:00Z');
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS community_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid())');
    const ProgramBlueprint = (await import('../../../../models/ProgramBlueprint')).default;
    const Cohort = (await import('../../../../models/Cohort')).default;
    await ProgramBlueprint.sync();
    await Cohort.sync();
    const { ensureCommsHubSchema } = await import('../../../../db/ensureCommsHubSchema');
    const r = await ensureCommsHubSchema();
    expect(r.missing).toEqual([]);
    ({ deliveryRepo: repo } = await import('../deliveryRepo'));
    ({ runDeliveryTick } = await import('../deliveryWorker'));
    ({ approvalHash } = await import('../../messages/messageStatus'));
    ({ loadContent } = await import('../../messages/approvals'));
  });

  afterAll(async () => {
    await sequelize.query(`DROP TABLE IF EXISTS comms_hub_activity, comms_hub_deliveries, comms_hub_approvals, comms_hub_destinations,
      comms_hub_drafts, comms_hub_messages, comms_hub_thumbnails, comms_hub_settings, comms_hub_events, community_events, cohorts, program_blueprints CASCADE`);
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM comms_hub_activity; DELETE FROM comms_hub_deliveries; DELETE FROM comms_hub_approvals; DELETE FROM comms_hub_destinations; DELETE FROM comms_hub_drafts; DELETE FROM comms_hub_messages; DELETE FROM comms_hub_events; DELETE FROM cohorts');
    await sequelize.query('UPDATE comms_hub_settings SET sending_paused = false, quiet_hours = NULL');
  });

  async function cohort(name: string): Promise<string> {
    return (await q<{ id: string }>(`INSERT INTO cohorts (id, name, start_date, core_day, core_time, max_seats, seats_taken, status, created_at)
      VALUES (gen_random_uuid(), $1, '2026-11-01', 'Tuesday', '18:00', 50, 0, 'open', now()) RETURNING id`, [name]))[0].id;
  }
  /** An approved, scheduled message to the given feeds, approved on its real content hash. */
  async function approvedMessage(feeds: string[], body = 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.'): Promise<string> {
    const m = (await q<{ id: string }>(`INSERT INTO comms_hub_messages (kind, status, subject) VALUES ('reminder', 'scheduled', 'Demo Tuesday') RETURNING id`))[0].id;
    await q(`INSERT INTO comms_hub_drafts (message_id, channel, version, body, author) VALUES ($1, 'community_post', 1, $2, 'ai') RETURNING id`, [m, body]);
    for (const f of feeds) await q(`INSERT INTO comms_hub_destinations (message_id, channel, target_type, target_id) VALUES ($1, 'community_post', 'cohort_feed', $2) RETURNING id`, [m, f]); // eslint-disable-line no-await-in-loop
    const hash = approvalHash(await loadContent(m));
    await q(`INSERT INTO comms_hub_approvals (message_id, approved_by, content_hash) VALUES ($1, 'jackie-1', $2) RETURNING id`, [m, hash]);
    return m;
  }
  const deliveriesOf = (m: string) => q<{ status: string; attempt_count: number; claimed_at: Date; provider_message_id: string | null; idempotency_key: string }>(
    'SELECT status, attempt_count, claimed_at, provider_message_id, idempotency_key FROM comms_hub_deliveries WHERE message_id = $1 ORDER BY idempotency_key', [m]);

  it('start: one pending row per destination on its stable key; the message is sending', async () => {
    const m = await approvedMessage([await cohort('A'), await cohort('B')]);
    expect(await repo.startMessage(m, NOW)).toBe('started');
    expect(await repo.startMessage(m, NOW)).toBe('not_due'); // already sending
    const rows = await deliveriesOf(m);
    expect(rows.map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(rows.every((r) => r.idempotency_key.startsWith(`comms_hub:${m}:`))).toBe(true);
    expect((await q<{ status: string }>('SELECT status FROM comms_hub_messages WHERE id = $1', [m]))[0].status).toBe('sending');
  });

  it('two claims at once never take the same row, and a row another transaction holds is skipped', async () => {
    const feeds = await Promise.all(['A', 'B', 'C', 'D'].map(cohort));
    const m = await approvedMessage(feeds);
    await repo.startMessage(m, NOW);
    const [x, y] = await Promise.all([repo.claimDue(NOW, 3), repo.claimDue(NOW, 3)]);
    const ids = [...x, ...y].map((d) => d.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);

    // Back to pending, then hold one row in an open transaction: the claim skips it rather than waiting.
    await sequelize.query(`UPDATE comms_hub_deliveries SET status = 'pending', attempt_count = 0 WHERE message_id = '${m}'`);
    const held = await sequelize.transaction();
    try {
      const [h] = await sequelize.query<{ id: string }>(`SELECT id FROM comms_hub_deliveries WHERE message_id = '${m}' ORDER BY created_at LIMIT 1 FOR UPDATE`, { type: QueryTypes.SELECT, transaction: held });
      const got = await repo.claimDue(NOW, 10);
      expect(got.map((d) => d.id)).not.toContain(h.id);
      expect(got).toHaveLength(3);
    } finally { await held.rollback(); }
  });

  it('a row left sending past the lease is claimed again, attempt counted, first claim kept; inside the lease it is not', async () => {
    const m = await approvedMessage([await cohort('A')]);
    await repo.startMessage(m, NOW);
    const [first] = await repo.claimDue(NOW, 10);
    expect(await repo.claimDue(new Date(NOW.getTime() + 60_000), 10)).toHaveLength(0);
    const [again] = await repo.claimDue(new Date(NOW.getTime() + 11 * 60_000), 10);
    expect(again).toEqual(expect.objectContaining({ id: first.id, attempt: 2 }));
    expect(again.first_claimed_at.toISOString()).toBe(NOW.toISOString());
    // The first, stale claim may no longer send.
    const decide = jest.fn();
    expect(await repo.withSendLock(first, NOW, decide)).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it('reclaims are bounded: after the last try a row left sending is failed, not claimed', async () => {
    const m = await approvedMessage([await cohort('A')]);
    await repo.startMessage(m, NOW);
    let t = NOW.getTime();
    for (let i = 1; i <= 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await repo.claimDue(new Date(t), 10)).map((c) => c.attempt)).toEqual([i]);
      t += 11 * 60_000;
    }
    expect(await repo.claimDue(new Date(t), 10)).toEqual([]);
    expect((await deliveriesOf(m))[0]).toEqual(expect.objectContaining({ status: 'failed', attempt_count: 4 }));
    expect(await repo.settledSendingIds(10)).toEqual([m]);
  });

  it('the send lock: two messages to one feed are sent one after the other, never together', async () => {
    const feed = await cohort('A');
    const m1 = await approvedMessage([feed]);
    const m2 = await approvedMessage([feed], 'A second message to the same feed.');
    await repo.startMessage(m1, NOW); await repo.startMessage(m2, NOW);
    const claims = await repo.claimDue(NOW, 10);
    expect(claims).toHaveLength(2);
    const spans: Array<[number, number]> = [];
    await Promise.all(claims.map((c) => repo.withSendLock(c, NOW, async () => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, 300));
      spans.push([start, Date.now()]);
      return { kind: 'sent', provider_message_id: `post-${c.id}`, reached: 1 };
    })));
    spans.sort((a, b) => a[0] - b[0]);
    expect(spans[1][0]).toBeGreaterThanOrEqual(spans[0][1]);
  });

  it('a whole tick: started, sent once per feed, the result recorded, the activity written; a second tick does nothing', async () => {
    const m = await approvedMessage([await cohort('A'), await cohort('B')]);
    const calls: ConnectorDelivery[] = [];
    const ch: Connector = { channel: 'community_post', async send(d) { calls.push(d); return { provider_message_id: `post-${calls.length}`, reached: 1, already_done: false }; } };
    const deps = { repo, connector: () => ch, log: () => undefined };
    const r = await runDeliveryTick(deps, NOW);
    expect(r).toEqual(expect.objectContaining({ started: 1, sent: 2, finished: { [m]: 'sent' } }));
    expect((await deliveriesOf(m)).map((x) => x.status)).toEqual(['sent', 'sent']);
    const acts = await q<{ action: string }>('SELECT action FROM comms_hub_activity WHERE entity_id = $1 ORDER BY created_at', [m]);
    expect(acts.map((a) => a.action)).toEqual(['message.sending', 'message.sent']);
    expect((await runDeliveryTick(deps, new Date(NOW.getTime() + 60_000))).attempted).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it('a sending message with nothing left in flight is listed for its result', async () => {
    const m = await approvedMessage([await cohort('A')]);
    await repo.startMessage(m, NOW);
    expect(await repo.settledSendingIds(10)).toEqual([]);
    await sequelize.query(`UPDATE comms_hub_deliveries SET status = 'sent' WHERE message_id = '${m}'`);
    expect(await repo.settledSendingIds(10)).toEqual([m]);
    expect(await repo.finishMessage(m, NOW)).toBe('sent');
    expect(await repo.settledSendingIds(10)).toEqual([]);
  });

  it('CH7.3 cancelling the event mid-send: pending deliveries cancelled, the approval voided, the worker sends nothing more', async () => {
    const ev = (await q<{ id: string }>(`INSERT INTO comms_hub_events (title, starts_at, status) VALUES ('Demo Tuesday', '2026-12-02T00:00:00Z', 'scheduled') RETURNING id`))[0].id;
    const feeds = [await cohort('A'), await cohort('B')];
    const m = await approvedMessage(feeds);
    await sequelize.query(`UPDATE comms_hub_messages SET event_id = '${ev}' WHERE id = '${m}'`);
    // Approval hash does not include the event, so it still matches after linking.
    await repo.startMessage(m, NOW);
    const { cascadeEventCancel } = await import('../../messages/eventCascade');
    // The event's own cancel sets its status in the same transaction; this case drives the cascade directly.
    const out = await sequelize.transaction(async (t) => {
      await sequelize.query(`UPDATE comms_hub_events SET status = 'cancelled' WHERE id = '${ev}'`, { transaction: t });
      return cascadeEventCancel(ev, { id: 'jackie-1', label: 'Jackie' }, NOW, t);
    });
    expect(out).toEqual({ messages_cancelled: 0, deliveries_cancelled: 2, sending_voided: 1 });
    expect((await deliveriesOf(m)).map((d) => d.status)).toEqual(['cancelled', 'cancelled']);
    const calls: ConnectorDelivery[] = [];
    const ch: Connector = { channel: 'community_post', async send(d) { calls.push(d); return { provider_message_id: 'x', reached: 1, already_done: false }; } };
    const r = await runDeliveryTick({ repo, connector: () => ch, log: () => undefined }, new Date(NOW.getTime() + 60_000));
    expect(calls).toHaveLength(0);
    expect(r.finished).toEqual({ [m]: 'cancelled' });
    // It ends cancelled: never back in the approval queue, where approving it would send it after all.
    expect((await q<{ status: string }>('SELECT status FROM comms_hub_messages WHERE id = $1', [m]))[0].status).toBe('cancelled');
  });

  it('paused in the settings row: nothing starts', async () => {
    const m = await approvedMessage([await cohort('A')]);
    await sequelize.query('UPDATE comms_hub_settings SET sending_paused = true');
    const r = await runDeliveryTick({ repo, connector: () => { throw new Error('must not send'); }, log: () => undefined }, NOW);
    expect(r.paused).toBe(true);
    expect((await q<{ status: string }>('SELECT status FROM comms_hub_messages WHERE id = $1', [m]))[0].status).toBe('scheduled');
  });
});
