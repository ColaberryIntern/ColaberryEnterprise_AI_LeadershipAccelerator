/**
 * CH10.4 on a real Postgres (scratch database): the claim takes at most ONE WhatsApp delivery, none
 * while the pacing gap or the breaker is in force or another WhatsApp send is in flight, two claims at
 * once never take two, other channels are claimed as before, and the pacing that results puts real
 * sends at least 40 seconds apart on a 1-minute tick. Plus the state store's atomic SQL (reserve, the
 * once-only alert key, the breaker, other deliveries' recorded ids).
 *
 * The schema is the hub's own ensureCommsHubSchema. Runs in CI's integration tier. Locally:
 *   DATABASE_URL=postgres://chub@127.0.0.1:55452/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub
 * NEVER point it at production: it creates and drops tables. No WhatsApp request is made.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub whatsappClaim.integration] SKIPPED: no DATABASE_URL. Not evidence that WhatsApp pacing holds in Postgres, unless it ran.');
}

describeIfDb('CH10.4 WhatsApp claim and sending state, on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let repo: typeof import('../../delivery/deliveryRepo').deliveryRepo;
  let state: typeof import('../sendState').sendStateStore;
  const T0 = new Date('2026-12-01T18:00:00Z');
  const at = (ms: number): Date => new Date(T0.getTime() + ms);
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS community_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid())');
    const { ensureCommsHubSchema } = await import('../../../../db/ensureCommsHubSchema');
    expect((await ensureCommsHubSchema()).missing).toEqual([]);
    ({ deliveryRepo: repo } = await import('../../delivery/deliveryRepo'));
    ({ sendStateStore: state } = await import('../sendState'));
  });
  afterAll(async () => { await sequelize.close(); });
  beforeEach(async () => {
    await sequelize.query('DELETE FROM comms_hub_deliveries; DELETE FROM comms_hub_destinations; DELETE FROM comms_hub_messages');
    await sequelize.query('UPDATE comms_hub_settings SET whatsapp_next_send_at = NULL, whatsapp_day = NULL, whatsapp_day_count = 0, whatsapp_breaker_until = NULL, whatsapp_breaker_reason = NULL, whatsapp_breaker_alerted_for = NULL');
  });

  /** A sending message with `n` pending deliveries on `channel`. */
  async function pending(channel: 'whatsapp' | 'in_app', n: number): Promise<string[]> {
    const m = (await q<{ id: string }>("INSERT INTO comms_hub_messages (kind, status, subject) VALUES ('reminder', 'sending', 'Demo') RETURNING id"))[0].id;
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const target = channel === 'whatsapp' ? `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}` : `c${i}`;
      // eslint-disable-next-line no-await-in-loop
      const dest = (await q<{ id: string }>('INSERT INTO comms_hub_destinations (message_id, channel, target_type, target_id) VALUES ($1, $2, $3, $4) RETURNING id', [m, channel, channel === 'whatsapp' ? 'whatsapp_group' : 'in_app_audience', target]))[0].id;
      // eslint-disable-next-line no-await-in-loop
      ids.push((await q<{ id: string }>("INSERT INTO comms_hub_deliveries (message_id, destination_id, channel, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id", [m, dest, channel, `k:${m}:${dest}`, at(i)]))[0].id);
    }
    return ids;
  }
  const status = async (id: string) => (await q<{ status: string; attempt_count: number }>('SELECT status, attempt_count FROM comms_hub_deliveries WHERE id = $1', [id]))[0];
  const markSent = (id: string, now: Date) => q("UPDATE comms_hub_deliveries SET status = 'sent', sent_at = $2, updated_at = $2 WHERE id = $1 RETURNING id", [id, now]);

  it('one WhatsApp per claim; every in-app delivery as before; unpicked WhatsApp rows spend no try', async () => {
    const wa = await pending('whatsapp', 3);
    const ia = await pending('in_app', 4);
    const claimed = await repo.claimDue(T0, 25);
    expect(claimed.filter((c) => c.channel === 'whatsapp').map((c) => c.id)).toEqual([wa[0]]);
    expect(claimed.filter((c) => c.channel === 'in_app').map((c) => c.id).sort()).toEqual([...ia].sort());
    expect(await status(wa[1])).toEqual({ status: 'pending', attempt_count: 0 });
  });

  it('no WhatsApp claim while one is in flight, while paced, or while the breaker is open', async () => {
    const wa = await pending('whatsapp', 2);
    expect((await repo.claimDue(T0, 25)).map((c) => c.id)).toEqual([wa[0]]);
    expect(await repo.claimDue(at(1000), 25)).toEqual([]); // wa[0] still sending
    await markSent(wa[0], at(2000));
    await state.reserve(at(2000), at(62_000));
    expect(await repo.claimDue(at(30_000), 25)).toEqual([]); // paced
    await state.openBreaker(at(30_000), 'rate_limited');
    expect(await repo.claimDue(at(63_000), 25)).toEqual([]); // breaker
    expect(await state.clearBreaker()).toEqual(at(30_000 + 48 * 3600_000));
    expect((await repo.claimDue(at(63_000), 25)).map((c) => c.id)).toEqual([wa[1]]);
  });

  it('the breaker closes by itself after 48 hours: nothing before, claimed again after, with no one clearing it', async () => {
    const [w] = await pending('whatsapp', 1);
    const until = await state.openBreaker(T0, 'rate_limited');
    expect(until).toEqual(at(48 * 3600_000));
    expect(await repo.claimDue(at(47 * 3600_000), 25)).toEqual([]);
    expect(await repo.claimDue(at(48 * 3600_000 - 1000), 25)).toEqual([]);
    expect((await repo.claimDue(at(48 * 3600_000 + 1000), 25)).map((c) => c.id)).toEqual([w]);
    expect((await state.read()).breaker_until).toEqual(until); // still recorded: it simply no longer applies
  });

  it('two claims at once never take two WhatsApp deliveries', async () => {
    await pending('whatsapp', 5);
    const [a, b] = await Promise.all([repo.claimDue(T0, 25), repo.claimDue(T0, 25)]);
    expect([...a, ...b].filter((c) => c.channel === 'whatsapp')).toHaveLength(1);
  });

  it('on a 1-minute tick with 40 to 80 second gaps, real sends are at least 40 seconds apart and never a burst', async () => {
    const wa = await pending('whatsapp', 4);
    const { nextSendAt } = await import('../sendRules');
    const rand = [0.1, 0.9, 0.5, 0.3];
    const sentAt: number[] = [];
    for (let tick = 0; tick < 12 && sentAt.length < wa.length; tick += 1) {
      const now = at(tick * 60_000);
      // eslint-disable-next-line no-await-in-loop
      const got = (await repo.claimDue(now, 25)).filter((c) => c.channel === 'whatsapp');
      expect(got.length).toBeLessThanOrEqual(1);
      if (got.length === 0) continue;
      // eslint-disable-next-line no-await-in-loop
      await state.reserve(now, nextSendAt(now, () => rand[sentAt.length]));
      // eslint-disable-next-line no-await-in-loop
      await markSent(got[0].id, now);
      sentAt.push(now.getTime());
    }
    expect(sentAt).toHaveLength(4);
    const gaps = sentAt.slice(1).map((t, i) => t - sentAt[i]);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(40_000);
    expect(new Set(gaps).size).toBeGreaterThan(1); // tick-quantized to 60 s or 120 s, not one fixed interval
    expect((await state.read()).count).toBe(4);
  });

  it('the state store: the day count resets on a new Central day; an alert key is claimed once; other deliveries\' ids are found', async () => {
    await state.reserve(at(0), at(60_000));
    await state.reserve(at(1000), at(60_000));
    expect((await state.read())).toMatchObject({ day: '2026-12-01', count: 2 });
    await state.reserve(new Date('2026-12-02T15:00:00Z'), at(60_000));
    expect((await state.read())).toMatchObject({ day: '2026-12-02', count: 1 });
    expect(await state.claimAlert('breaker:x')).toBe(true);
    expect(await state.claimAlert('breaker:x')).toBe(false);
    expect(await state.claimAlert('breaker:y')).toBe(true);
    const [d1, d2] = await pending('whatsapp', 2);
    await q("UPDATE comms_hub_deliveries SET provider_message_id = 'wa-1' WHERE id = $1 RETURNING id", [d1]);
    expect([...(await state.recordedElsewhere(['wa-1', 'wa-2'], d2))]).toEqual(['wa-1']);
    expect([...(await state.recordedElsewhere(['wa-1'], d1))]).toEqual([]);
  });
});
