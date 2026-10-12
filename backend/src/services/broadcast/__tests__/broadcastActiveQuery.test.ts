jest.mock('../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

import BroadcastOccurrence from '../../../models/BroadcastOccurrence';
import {
  ACTIVE_DISCOVERY_STATES,
  ACTIVE_DISCOVERY_LIMIT,
  findActiveOccurrences,
} from '../broadcastActiveQuery';
import { BROADCAST_STATEMENTS } from '../../../db/ensureBroadcastSchema';

const findAll = (BroadcastOccurrence as unknown as { findAll: jest.Mock }).findAll;

/**
 * The "what is airing" read, and the one property that is invisible until production is slow.
 *
 * The schema creates a PARTIAL index whose predicate is
 * `editorial_state IN ('backstage','live','reconnecting')`. Postgres can serve this query from
 * that index only while the query's own state list is a SUBSET of the predicate. Add a fourth
 * state and the index silently stops applying, and a ticker that every signed-in viewer polls
 * becomes a sequential scan over every broadcast that ever aired. Nothing fails; it just gets
 * slower under exactly the load it was built for.
 *
 * So the subset relationship is asserted against the SQL the schema actually ships, rather
 * than against a copy of the predicate written down here.
 */

const indexPredicateStates = (): string[] => {
  const ddl = BROADCAST_STATEMENTS.find(
    (sql) => sql.includes('idx_broadcast_occ_active'),
  );
  if (!ddl) throw new Error('idx_broadcast_occ_active is not in the schema statements');
  const match = /WHERE editorial_state IN \(([^)]+)\)/.exec(ddl);
  if (!match) throw new Error('the index has no editorial_state predicate to compare against');
  return match[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
};

describe('the query stays on the partial index', () => {
  it('finds the index and its predicate — a comparison against nothing proves nothing', () => {
    const states = indexPredicateStates();
    expect(states.length).toBeGreaterThanOrEqual(3);
    expect(states).toContain('live');
  });

  it('asks only for states the index predicate covers', () => {
    const covered = indexPredicateStates();
    const asked = [...ACTIVE_DISCOVERY_STATES];
    expect(asked.filter((s) => !covered.includes(s))).toEqual([]);
  });

  it('excludes backstage, which is a producer state and not airing', () => {
    // Listing it would announce a class before anyone chose to go live, which is the opposite
    // of the deliberate "mark live" step the whole feature is built around.
    expect([...ACTIVE_DISCOVERY_STATES]).not.toContain('backstage');
    expect(indexPredicateStates()).toContain('backstage');
  });
});

describe('findActiveOccurrences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('queries the active states, ordered by start, with a bound', async () => {
    findAll.mockResolvedValue([]);
    await findActiveOccurrences();

    const args = findAll.mock.calls[0][0];
    expect(args.order).toEqual([['scheduled_start_at', 'ASC']]);
    expect(args.limit).toBe(ACTIVE_DISCOVERY_LIMIT);
    expect(args.attributes).toContain('room_id');
    // The provider ids and the policy snapshot have no business in a badge payload.
    expect(args.attributes).not.toContain('provider_session_id');
    expect(args.attributes).not.toContain('access_policy_snapshot');
  });

  it('maps columns explicitly, because spreading a Sequelize instance loses every one of them', async () => {
    const started = new Date('2026-10-07T18:02:00Z');
    findAll.mockResolvedValue([{
      id: 'occ-1', title: 'Week 9', room_id: 'room-1', access_mode: 'private',
      editorial_state: 'live', scheduled_start_at: null, content_started_at: started,
      preview_seconds: 900,
    }]);

    const rows = await findActiveOccurrences();

    expect(rows).toEqual([{
      id: 'occ-1', title: 'Week 9', room_id: 'room-1', access_mode: 'private',
      editorial_state: 'live', scheduled_start_at: null, content_started_at: started,
      preview_seconds: 900,
    }]);
  });

  it('honours a caller-supplied bound', async () => {
    findAll.mockResolvedValue([]);
    await findActiveOccurrences(5);
    expect(findAll.mock.calls[0][0].limit).toBe(5);
  });
});
