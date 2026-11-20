/**
 * CH5.3 acceptance, through the REAL playback-grant route (broadcastController.postPlaybackGrant) and
 * the REAL room eligibility and entitlement rules; only the database reads are replaced:
 * - an all-members hub stream (access 'free', no room): any member gets a grant;
 * - a one-cohort hub stream (access 'private' in that batch's room, privacy 'cohort'): a member of
 *   that cohort gets a grant, a member of another cohort is refused (not_room_eligible).
 */
type Row = Record<string, any>;
const occurrences = new Map<string, Row>();
const rooms = new Map<string, Row>();

jest.mock('../../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => occurrences.get(id) ?? null) } }));
// The REAL eligibility rule, with its two database reads injected through the seam it provides.
jest.mock('../../../broadcast/broadcastRoomEligibility', () => {
  const actual = jest.requireActual('../../../broadcast/broadcastRoomEligibility');
  return {
    ...actual,
    resolveRoomEligibility: (roomId: string | null, ctx: Row) => actual.resolveRoomEligibility(roomId, ctx, {
      findRoom: async (id: string) => rooms.get(id) ?? null,
      findMembership: async () => null,
    }),
  };
});
jest.mock('../../../broadcast/broadcastCommandService', () => ({ runProducerCommand: jest.fn() }));
jest.mock('../../../broadcast/broadcastAccessDeps', () => ({
  loadViewerAccessFacts: jest.fn(async () => ({ enrollment: null, cohort: null, roleInfo: null })),
  broadcastAccessDeps: {
    loadEnrollment: jest.fn(async (id: string) => ({ id, cohort_id: null })),
    loadCohort: jest.fn(async () => null),
    loadRoleInfo: jest.fn(async () => ({ isStaff: false, hasActiveComp: false })),
    cohortIdOf: () => null,
  },
}));
jest.mock('../../../broadcast/broadcastTelemetryService', () => ({ recordPlaybackBeat: jest.fn(), readLiveAudience: jest.fn() }));
jest.mock('../../../broadcast/broadcastActiveQuery', () => ({ ACTIVE_DISCOVERY_STATES: ['live', 'reconnecting'], findActiveOccurrences: jest.fn(async () => []) }));
jest.mock('../../../broadcast/broadcastReplayQuery', () => ({ REPLAY_DISCOVERY_STATES: ['replay_ready'], REPLAY_DISCOVERY_LIMIT: 25, REPLAY_RETENTION_DAYS: 25, findReplayOccurrences: jest.fn(async () => []) }));

import { postPlaybackGrant } from '../../../../controllers/broadcastController';

const FREE = '11111111-1111-4111-8111-111111111111';
const COHORT = '22222222-2222-4222-8222-222222222222';
const live = (id: string, o: Row = {}): Row => ({ id, title: 'Demo Tuesday', editorial_state: 'live', provider_health: 'ready', preview_seconds: 0, content_started_at: new Date(Date.now() - 60_000), provider: 'zoom', provider_session_id: null, room_id: null, access_mode: 'free', ...o });

function res(): any { const r: any = {}; r.status = jest.fn(() => r); r.json = jest.fn(() => r); r.set = jest.fn(() => r); return r; }
const asMember = (cohortId: string | null) => ({ participant: { sub: `enr-${cohortId ?? 'none'}`, cohort_id: cohortId, isStaff: false }, body: { asset: 'master.m3u8' } });
async function grant(occurrenceId: string, cohortId: string | null): Promise<{ status: number; body: Row }> {
  const r = res();
  await postPlaybackGrant({ params: { id: occurrenceId }, ...asMember(cohortId) } as any, r);
  const status = r.status.mock.calls.length ? r.status.mock.calls[0][0] : 200;
  return { status, body: r.json.mock.calls[0][0] };
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
  occurrences.clear(); rooms.clear();
  occurrences.set(FREE, live(FREE));
  rooms.set('room-c1', { id: 'room-c1', privacy: 'cohort', linked_cohort_id: 'c1', status: 'active' });
  occurrences.set(COHORT, live(COHORT, { access_mode: 'private', room_id: 'room-c1' }));
});

describe('CH5.3 who gets a playback grant for a hub event stream', () => {
  it('all members: a member of any cohort, and one with no cohort, are granted', async () => {
    for (const c of ['c1', 'c2', null]) {
      const g = await grant(FREE, c);
      expect(g.status).toBe(200);
      expect(g.body).toHaveProperty('url');
    }
  });

  it('one cohort: a member of that cohort is granted', async () => {
    const g = await grant(COHORT, 'c1');
    expect(g.status).toBe(200);
    expect(g.body).toHaveProperty('url');
  });

  it('one cohort: a member of another cohort, or with none, is refused (not_room_eligible), with no url', async () => {
    for (const c of ['c2', null]) {
      const g = await grant(COHORT, c);
      expect(g.status).toBe(403);
      expect(g.body).toMatchObject({ error: 'NotEntitled', reason: 'not_room_eligible', offer_upgrade: false });
      expect(g.body).not.toHaveProperty('url');
    }
  });
});
