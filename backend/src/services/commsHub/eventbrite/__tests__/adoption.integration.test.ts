/**
 * CH9.5 on a real Postgres (scratch database): managing an Eventbrite event in the hub is one hub
 * event however many times, and however concurrently, it is adopted. That rests on the partial unique
 * index and on the ON CONFLICT target naming the same predicate, which only a real Postgres can prove
 * (it rejects a conflict target that does not match a partial index). Also proves the phase 2 columns
 * reach a table created by phase 1's DDL, which is what production has.
 *
 * The schema is the hub's own ensureCommsHubSchema, on a stub community_events table. Runs in CI's
 * integration tier (scripts/ci/runIntegrationSuites.js gives it its own database). Locally:
 *   DATABASE_URL=postgres://chub@127.0.0.1:55452/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub
 * NEVER point it at production: it creates and drops tables.
 */
import { QueryTypes } from 'sequelize';
import type { EventbriteEventView } from '../eventbriteEvents';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub adoption.integration] SKIPPED: no DATABASE_URL. Not evidence that adopting is idempotent in Postgres, unless it ran.');
}

describeIfDb('CH9.5 managing an Eventbrite event, on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let adopt: typeof import('../adoption').adoptEventbriteEvent;
  let ensure: typeof import('../../../../db/ensureCommsHubSchema').ensureCommsHubSchema;
  const ACTOR = { id: 'u-jackie', label: 'jackie@colaberry.com' };
  const NOW = new Date('2026-11-21T22:00:00Z').getTime();
  const EB = (id: string): EventbriteEventView => ({
    ccpp_event_id: id, title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: '2026-12-04T02:00:00.000Z',
    registration_url: `https://www.eventbrite.com/e/ai-open-house-${id}`, image_url: 'https://img.test/a.png', registered: 3, description: null, eventbrite_status: 'live',
  });
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS community_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid())');
    ({ ensureCommsHubSchema: ensure } = await import('../../../../db/ensureCommsHubSchema'));
    expect((await ensure()).missing).toEqual([]);
    ({ adoptEventbriteEvent: adopt } = await import('../adoption'));
  });

  afterAll(async () => {
    await sequelize.query(`DROP TABLE IF EXISTS comms_hub_alerts, comms_hub_activity, comms_hub_deliveries, comms_hub_approvals, comms_hub_destinations,
      comms_hub_drafts, comms_hub_messages, comms_hub_event_photos, comms_hub_thumbnails, comms_hub_settings, comms_hub_events, community_events CASCADE`);
    await sequelize.close();
  });

  beforeEach(async () => { await sequelize.query('DELETE FROM comms_hub_activity'); await sequelize.query('DELETE FROM comms_hub_events'); });

  it('a phase 1 table (no Eventbrite columns, as production has today) gains them, and the index, on the next boot', async () => {
    await sequelize.query('DROP INDEX IF EXISTS uq_comms_hub_events_ccpp');
    await sequelize.query('ALTER TABLE comms_hub_events DROP COLUMN ccpp_event_id, DROP COLUMN source_image_url, DROP COLUMN ccpp_missing_since');
    expect((await ensure()).missing).toEqual([]);
    const cols = (await q<{ c: string }>(`SELECT column_name::text AS c FROM information_schema.columns WHERE table_name = 'comms_hub_events' AND column_name IN ('ccpp_event_id', 'source_image_url', 'ccpp_missing_since') ORDER BY 1`)).map((r) => r.c);
    expect(cols).toEqual(['ccpp_event_id', 'ccpp_missing_since', 'source_image_url']);
    const idx = await q<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_comms_hub_events_ccpp'`);
    expect(idx[0].indexdef).toMatch(/UNIQUE INDEX .*\(ccpp_event_id\) WHERE \(ccpp_event_id IS NOT NULL\)/);
  });

  it('adopting twice is one hub event: the first creates, the second finds it, one activity row', async () => {
    const findEvent = async () => EB('1992498063344');
    const a = await adopt('1992498063344', ACTOR, { findEvent, now: () => NOW });
    const b = await adopt('1992498063344', ACTOR, { findEvent, now: () => NOW });
    expect([a.created, b.created]).toEqual([true, false]);
    expect(b.event.id).toBe(a.event.id);
    expect(a.event).toMatchObject({ title: 'AI Open House', ccpp_event_id: '1992498063344', audience: { kind: 'all_members' }, status: 'scheduled' });
    expect(a.event.placement).toEqual({ calendar: false, events_page: true, campus_rail: false });
    expect((await q<{ n: string }>(`SELECT count(*)::text AS n FROM comms_hub_events WHERE ccpp_event_id = '1992498063344'`))[0].n).toBe('1');
    expect((await q<{ n: string }>(`SELECT count(*)::text AS n FROM comms_hub_activity WHERE action = 'event.adopted'`))[0].n).toBe('1');
  });

  it('five people adopting the same event at the same moment still make one hub event', async () => {
    const findEvent = async () => EB('5550001');
    const results = await Promise.all(Array.from({ length: 5 }, () => adopt('5550001', ACTOR, { findEvent, now: () => NOW })));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.event.id)).size).toBe(1);
    expect((await q<{ n: string }>(`SELECT count(*)::text AS n FROM comms_hub_events WHERE ccpp_event_id = '5550001'`))[0].n).toBe('1');
  });

  it('hub-made events (no Eventbrite id) never collide with each other on the index', async () => {
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`INSERT INTO comms_hub_events (title, starts_at) VALUES ('Hub-made', now() + interval '1 day')`);
    }
    expect((await q<{ n: string }>(`SELECT count(*)::text AS n FROM comms_hub_events WHERE ccpp_event_id IS NULL`))[0].n).toBe('3');
  });
});
