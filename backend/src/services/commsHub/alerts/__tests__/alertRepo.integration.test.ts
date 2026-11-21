/**
 * CH7.5 failure alerts on a real Postgres (scratch database): queueing is once per state change per
 * recipient however often it runs (ON CONFLICT on the unique key), two workers claiming at once never
 * take the same row (FOR UPDATE SKIP LOCKED), a stale claim cannot overwrite a newer one, and a row
 * left `sending` past the lease with its tries spent is failed.
 *
 * Runs in CI's integration tier (scripts/ci/runIntegrationSuites.js gives it its own database).
 * Locally, as deliveryRepo.integration.test.ts says. NEVER point it at production: it creates and
 * drops tables.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);
jest.mock('../../../../config/env', () => ({ ...jest.requireActual('../../../../config/env'), env: { ...jest.requireActual('../../../../config/env').env, frontendUrl: 'https://enterprise.colaberry.ai' } }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub alertRepo.integration] SKIPPED: no DATABASE_URL. Not evidence that alerts are queued once or claimed safely in Postgres, unless it ran.');
}

describeIfDb('CH7.5 failure alerts on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let repo: typeof import('../alertRepo').alertRepo;
  let runFailureAlerts: typeof import('../failureAlerts').runFailureAlerts;
  const NOW = new Date('2026-11-20T16:00:00Z');
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS community_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid())');
    const { ensureCommsHubSchema } = await import('../../../../db/ensureCommsHubSchema');
    expect((await ensureCommsHubSchema()).missing).toEqual([]);
    ({ alertRepo: repo } = await import('../alertRepo'));
    ({ runFailureAlerts } = await import('../failureAlerts'));
  });

  afterAll(async () => {
    await sequelize.query(`DROP TABLE IF EXISTS comms_hub_alerts, comms_hub_activity, comms_hub_deliveries, comms_hub_approvals, comms_hub_destinations,
      comms_hub_drafts, comms_hub_messages, comms_hub_thumbnails, comms_hub_event_photos, comms_hub_settings, comms_hub_events, community_events CASCADE`);
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM comms_hub_alerts; DELETE FROM comms_hub_activity; DELETE FROM comms_hub_messages');
    await sequelize.query(`UPDATE comms_hub_settings SET alert_recipients = '["ops@colaberry.com","jackie@colaberry.com"]'::jsonb`);
  });

  async function failedMessage(action = 'message.failed', at = NOW): Promise<{ m: string; s: string }> {
    const m = (await q<{ id: string }>(`INSERT INTO comms_hub_messages (kind, status, subject) VALUES ('update', 'failed', 'Holiday hours') RETURNING id`))[0].id;
    const s = (await q<{ id: string }>(`INSERT INTO comms_hub_activity (actor_label, action, entity_type, entity_id, detail, created_at)
      VALUES ('Scheduled sender', $1, 'message', $2, '{"sent":0,"not_sent":2}'::jsonb, $3) RETURNING id`, [action, m, at]))[0].id;
    return { m, s };
  }
  const rows = () => q<{ recipient: string; status: string; attempt_count: number; failure_state: string }>('SELECT recipient, status, attempt_count, failure_state FROM comms_hub_alerts ORDER BY recipient');

  it('queues once per state change per recipient, plus the dashboard; running it again adds nothing', async () => {
    await failedMessage();
    await failedMessage('message.partially_failed');
    await failedMessage('message.sent');
    await failedMessage('message.failed', new Date(NOW.getTime() - 49 * 3600_000));
    const stopped = await failedMessage();
    await sequelize.query(`UPDATE comms_hub_messages SET status = 'cancelled' WHERE id = $1`, { bind: [stopped.m] });
    const recipients = await repo.recipients();
    expect(await repo.queue(recipients, new Date(NOW.getTime() - 48 * 3600_000), NOW)).toBe(6);
    expect(await repo.queue(recipients, new Date(NOW.getTime() - 48 * 3600_000), NOW)).toBe(0);
    expect((await rows()).map((r) => r.failure_state).sort()).toEqual(['failed', 'failed', 'failed', 'partially_failed', 'partially_failed', 'partially_failed']);
  });

  it('two workers claiming at once never take the same row', async () => {
    await failedMessage();
    await repo.queue(await repo.recipients(), new Date(0), NOW);
    const [a, b] = await Promise.all([repo.claim(NOW, 2), repo.claim(NOW, 2)]);
    const ids = [...a, ...b].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(3);
  });

  it('a stale claim cannot overwrite the newer one; a spent row left sending is failed', async () => {
    await failedMessage();
    await repo.queue([], new Date(0), NOW);
    const [first] = await repo.claim(NOW, 10);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    const [second] = await repo.claim(later, 10); // the lease passed: taken again, try 2
    expect(second.attempt).toBe(2);
    await repo.settle(second, { kind: 'sent' }, later);
    await repo.settle(first, { kind: 'failed', error: 'late' }, later);
    expect((await rows())[0]).toEqual(expect.objectContaining({ status: 'sent', attempt_count: 2 }));

    await sequelize.query(`UPDATE comms_hub_alerts SET status = 'sending', attempt_count = 3, claimed_at = $1`, { bind: [NOW] });
    expect(await repo.claim(later, 10)).toEqual([]);
    expect((await rows())[0].status).toBe('failed');
  });

  it('a whole pass: the dashboard and both recipients once, with the message title and counts', async () => {
    await failedMessage();
    const sent: string[] = [];
    const deps = {
      repo,
      senders: { dashboard: async (c: { title: string }) => { sent.push(`dashboard:${c.title}`); }, email: async (to: string, c: { description: string }) => { sent.push(`${to}:${c.description.slice(0, 26)}`); }, emailReady: () => true },
      log: () => undefined,
    };
    expect((await runFailureAlerts(deps as never, NOW)).sent).toBe(3);
    expect((await runFailureAlerts(deps as never, new Date(NOW.getTime() + 60_000))).sent).toBe(0);
    expect(sent.sort()).toEqual([
      'dashboard:Communications Hub: Holiday hours did not send',
      'jackie@colaberry.com:0 of 2 recipients received',
      'ops@colaberry.com:0 of 2 recipients received',
    ]);
  });
});
