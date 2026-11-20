/**
 * CH7.1 on a real Postgres (scratch database): a hub community post appears in the TEST cohort's feed
 * through the community service's own createPost, and an 'announcement' notification appears for
 * that cohort's members through createNotification, with the CHECK constraint the boot DDL
 * (server.ts ensureMessagingSchema) puts on community_notifications.
 *
 * Runs in CI's integration tier (scripts/ci/runIntegrationSuites.js gives it its own database).
 * Locally: a disposable Postgres, then
 *   docker run --rm -d -p 55432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=ci postgres:16-alpine
 *   DATABASE_URL=postgres://ci@127.0.0.1:55432/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub/connectors
 * NEVER point it at production: it creates and drops tables.
 *
 * The points and progression services are mocked at their boundary (a program post earns nothing,
 * and their ledgers are not what this proves); everything the connectors write is real.
 */
import { QueryTypes } from 'sequelize';

jest.mock('../../../pointsService', () => ({
  award: jest.fn(async () => ({ awarded: true, points: 0 })),
  revoke: jest.fn(async () => undefined),
  hasAwarded: jest.fn(async () => false),
  sumPointsTodayByEventTypes: jest.fn(async () => 0),
  getPointsSummary: jest.fn(async () => ({ total: 0, events: [] })),
  getTotalsForEnrollments: jest.fn(async () => new Map()),
  levelForPoints: jest.fn(() => ({ level: 1, name: 'Apprentice' })),
}));
jest.mock('../../../progression/communityXpService', () => ({ awardCommunityXp: jest.fn(async () => undefined) }));
jest.mock('../../../subscriptionService', () => ({ activeCompEnrollmentIds: jest.fn(async () => new Set<string>()) }));
jest.mock('../../../progression/progressionService', () => ({ getRungNamesForEnrollments: jest.fn(async () => new Map<string, string>()) }));
// The deliveries table (and its message / destination / event chain) is not what this proves: no
// other delivery has recorded a post here, which is what an empty answer says.
jest.mock('../../../../models/CommsHubDelivery', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub connectors.integration] SKIPPED: no DATABASE_URL. Not evidence that a hub post or notification lands, unless it ran.');
}

describeIfDb('CH7.1 connectors on a scratch database: post in the test cohort feed, notification for its members', () => {
  let sequelize: import('sequelize').Sequelize;
  let connectorFor: typeof import('..').connectorFor;
  let award: jest.Mock;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const dbName = (await sequelize.query<{ d: string }>('SELECT current_database() AS d', { type: QueryTypes.SELECT }))[0].d;
    if (/prod/i.test(dbName)) throw new Error(`Refusing to run against ${dbName}`);
    ({ connectorFor } = await import('..'));
    ({ award } = await import('../../../pointsService') as unknown as { award: jest.Mock });
    const ProgramBlueprint = (await import('../../../../models/ProgramBlueprint')).default;
    const Cohort = (await import('../../../../models/Cohort')).default;
    const Enrollment = (await import('../../../../models/Enrollment')).default;
    const CommunityMember = (await import('../../../../models/CommunityMember')).default;
    const CommunityPost = (await import('../../../../models/CommunityPost')).default;
    const CommunityNotification = (await import('../../../../models/CommunityNotification')).default;
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    for (const m of [ProgramBlueprint, Cohort, Enrollment, CommunityMember, CommunityPost, CommunityNotification]) await (m as unknown as { sync: () => Promise<unknown> }).sync();
    // The boot DDL's CHECK, exactly as server.ts sets it, so 'announcement' is proven to be allowed.
    await sequelize.query('ALTER TABLE community_notifications DROP CONSTRAINT IF EXISTS ck_community_notifications_type');
    await sequelize.query("ALTER TABLE community_notifications ADD CONSTRAINT ck_community_notifications_type CHECK (notification_type IN ('mention','reply','like','friend_request','friend_accepted','new_message','announcement'))");

    const cohort = async (name: string, status: string): Promise<string> => {
      const c = await (Cohort as unknown as { create: (v: object) => Promise<{ id: string }> }).create({ name, status, start_date: '2026-11-01', core_day: 'Tuesday', core_time: '18:00', max_seats: 50 } as never);
      return c.id;
    };
    ids.test = await cohort('Comms Hub test cohort', 'open');
    ids.other = await cohort('Another cohort', 'open');
    const person = async (key: string, cohortId: string, withMember: boolean): Promise<void> => {
      const e = await (Enrollment as unknown as { create: (v: object) => Promise<{ id: string }> }).create({
        full_name: key, email: `${key}@example.test`, company: 'x', payment_status: 'paid', payment_method: 'invoice',
        status: 'active', cohort_id: cohortId, portal_enabled: true,
      } as never);
      ids[key] = e.id;
      if (withMember) ids[`m_${key}`] = (await (CommunityMember as unknown as { create: (v: object) => Promise<{ id: string }> }).create({ enrollment_id: e.id, display_name: key } as never)).id;
    };
    await person('ada', ids.test, true);
    await person('bo', ids.test, true);
    await person('cy', ids.test, false); // never opened the community: not notified, sees the feed post
    await person('dee', ids.other, true); // another cohort: not in the test audience
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS community_notifications, community_posts, community_members, enrollments, cohorts, program_blueprints CASCADE');
    await sequelize.close();
  });

  const since = new Date(Date.now() - 60_000);

  it('a community post appears in the test cohort feed, by Colaberry Team, with no points; a retry does not post twice', async () => {
    const d = {
      deliveryId: '00000000-0000-4000-8000-000000000001', messageId: '00000000-0000-4000-8000-0000000000aa', since,
      destination: { target_type: 'cohort_feed', target_id: ids.test },
      draft: { title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST. Bring one question.' },
    };
    const r = await connectorFor('community_post').send(d);
    expect(r.already_done).toBe(false);
    const feed = await sequelize.query<{ id: string; body: string; category: string; author: string; status: string }>(
      `SELECT p.id, p.body, p.category, p.status, m.display_name AS author FROM community_posts p JOIN community_members m ON m.id = p.member_id WHERE p.cohort_id = $1`,
      { bind: [ids.test], type: QueryTypes.SELECT },
    );
    expect(feed).toEqual([{ id: r.provider_message_id, body: d.draft.body, category: 'General', status: 'visible', author: 'Colaberry Team' }]);
    expect(award).not.toHaveBeenCalled();
    const again = await connectorFor('community_post').send(d);
    expect(again).toEqual({ provider_message_id: r.provider_message_id, reached: 1, already_done: true });
    const n = await sequelize.query<{ n: string }>('SELECT count(*)::text AS n FROM community_posts', { type: QueryTypes.SELECT });
    expect(n[0].n).toBe('1');
    const team = await sequelize.query<{ cohort_id: string | null; portal_enabled: boolean; email: string }>(
      `SELECT e.cohort_id, e.portal_enabled, e.email FROM enrollments e JOIN community_members m ON m.enrollment_id = e.id WHERE m.display_name = 'Colaberry Team'`,
      { type: QueryTypes.SELECT },
    );
    expect(team).toEqual([{ cohort_id: null, portal_enabled: false, email: 'colaberry-team@comms-hub.invalid' }]);
  });

  it('an announcement notification appears for each test cohort member with a profile, once, from Colaberry Team', async () => {
    const d = {
      deliveryId: '00000000-0000-4000-8000-000000000002', messageId: '00000000-0000-4000-8000-0000000000aa', since,
      destination: { target_type: 'in_app_audience', target_id: ids.test },
      draft: { title: 'Demo Tuesday, Dec 1', body: '6:00 PM CST' },
    };
    const r = await connectorFor('in_app').send(d);
    expect(r).toEqual({ provider_message_id: d.messageId, reached: 2, already_done: false });
    const rows = await sequelize.query<{ member_id: string; notification_type: string; source_type: string; source_id: string; actor: string }>(
      `SELECT n.member_id, n.notification_type, n.source_type, n.source_id, a.display_name AS actor
         FROM community_notifications n JOIN community_members a ON a.id = n.actor_member_id ORDER BY n.member_id`,
      { type: QueryTypes.SELECT },
    );
    expect(rows.map((x) => x.member_id).sort()).toEqual([ids.m_ada, ids.m_bo].sort());
    expect(rows.every((x) => x.notification_type === 'announcement' && x.source_type === 'comms_hub' && x.source_id === d.messageId && x.actor === 'Colaberry Team')).toBe(true);
    const again = await connectorFor('in_app').send(d);
    expect(again.reached).toBe(0);
    const n = await sequelize.query<{ n: string }>('SELECT count(*)::text AS n FROM community_notifications', { type: QueryTypes.SELECT });
    expect(n[0].n).toBe('2');
  });

  it('the database refuses a notification type the boot CHECK does not list (the constraint is live)', async () => {
    await expect(sequelize.query(
      `INSERT INTO community_notifications (id, member_id, notification_type, source_type, source_id, created_at) VALUES (gen_random_uuid(), $1, 'not_a_type', 'post', gen_random_uuid(), now())`,
      { bind: [ids.m_ada] },
    )).rejects.toThrow(/ck_community_notifications_type/);
  });
});
