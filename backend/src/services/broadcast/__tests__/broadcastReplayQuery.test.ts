const mockFindAll = jest.fn();
jest.mock('../../../models/BroadcastOccurrence', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockFindAll(...a) },
}));
const mockFindSessionIds = jest.fn();
// Only the I/O is stubbed. ACTIVE_DISCOVERY_STATES passes through from the real module,
// because a test that mocks away the constant it is comparing against is comparing
// against undefined - which is how the first version of this file 'passed'.
jest.mock('../broadcastActiveQuery', () => ({
  ...jest.requireActual('../broadcastActiveQuery'),
  findSessionIds: (...a: any[]) => mockFindSessionIds(...a),
}));

import { Op } from 'sequelize';
import {
  findReplayOccurrences, REPLAY_DISCOVERY_STATES, REPLAY_DISCOVERY_LIMIT,
  REPLAY_RETENTION_DAYS, replayRetentionCutoff,
} from '../broadcastReplayQuery';
import { ACTIVE_DISCOVERY_STATES } from '../broadcastActiveQuery';

/**
 * L8.3 — what a viewer can watch back.
 *
 * The load-bearing assertion is that an occurrence with NO BOUND RECORDING is never listed.
 * The ticket says what happens otherwise in as many words: built on the original premise,
 * every entry in the replay list would 404. The entry looks real, the click fails, and the
 * student concludes their class was never recorded.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'occ-1',
  title: 'Week 12 Build Day',
  room_id: 'room-1',
  access_mode: 'free',
  editorial_state: 'replay_ready',
  scheduled_start_at: new Date('2026-10-15T18:30:00Z'),
  content_started_at: new Date('2026-10-15T18:33:00Z'),
  ended_at: new Date('2026-10-15T19:40:00Z'),
  preview_seconds: 900,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([row()]);
  mockFindSessionIds.mockResolvedValue(new Map([['occ-1', 'sess-1']]));
});

describe('only what can actually play', () => {
  it('requires a bound recording in the QUERY, not at render time', async () => {
    // The L8.4 join. If this moves out of the where clause, the list fills with entries that
    // resolve to nothing and the failure lands on the student rather than on a test.
    await findReplayOccurrences();

    const where = mockFindAll.mock.calls[0][0].where;
    expect(where).toHaveProperty('provider_instance_uuid');
    // Same symbol trap as above: assert the OPERATOR, so 'is not null' is what is pinned
    // rather than the mere presence of a key that could hold anything.
    expect(where.provider_instance_uuid[Op.ne]).toBeNull();
  });

  it('asks only for replay_ready', async () => {
    await findReplayOccurrences();

    // Read through Op.in rather than JSON.stringify: Sequelize operators are SYMBOL
    // keys, and JSON.stringify drops them silently - the first version of this
    // assertion was comparing against the string "{}" and proving nothing.
    const states = mockFindAll.mock.calls[0][0].where.editorial_state[Op.in];
    expect(states).toEqual(['replay_ready']);
    // `ended` and `processing` are on the way to somewhere. Entitlement already answers
    // not_watchable for both, so listing them offers a row that refuses itself on click.
    expect(states).not.toContain('ended');
    expect(states).not.toContain('processing');
  });

  it('CONTROL: it does ask for something, so the assertions above are not vacuous', () => {
    expect([...REPLAY_DISCOVERY_STATES]).toEqual(['replay_ready']);
  });
});

/**
 * The retention window — Ali's decision of 27 Oct 2026, which the ticket asked for and the code
 * previously had no answer to ("what appears in the list and for how long").
 *
 * A duration is the easiest thing in this file to get wrong by an invisible margin: off by a
 * factor of 1000, off by one day, measured from the wrong column, or applied after the query so
 * that an expired class still consumes a slot on the page. Each of those is a separate test,
 * and the boundary is asserted from BOTH sides because a cutoff with only one side tested is a
 * cutoff that could be anywhere.
 */
describe('the retention window', () => {
  // A fixed instant. A boundary test against a live clock is a boundary test that passes at
  // 11:59 and fails at midnight.
  const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
  const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000);

  it('is 25 days, and says so in one place', () => {
    expect(REPLAY_RETENTION_DAYS).toBe(25);
  });

  it('computes the cutoff as exactly that many days back', () => {
    // Guards the units. A seconds-vs-milliseconds slip here would make the window 25 seconds
    // or 68 years, and either would pass a test that only checked "a cutoff exists".
    expect(replayRetentionCutoff(NOW).getTime()).toBe(NOW - 25 * 86_400_000);
  });

  it('asks the DATABASE for the window, not the caller afterwards', async () => {
    // In the query, so an expired class is never read, never sorted, and never counted against
    // the limit. Filtered later, twenty-five expired classes would push every live one off.
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, NOW);

    const where = mockFindAll.mock.calls[0][0].where;
    expect(where).toHaveProperty('ended_at');
    // The OPERATOR, read through the symbol: `>=`, not merely "a key called ended_at".
    expect(where.ended_at[Op.gte]).toEqual(replayRetentionCutoff(NOW));
  });

  it('measures from ended_at, which is when the class finished', async () => {
    // Not scheduled_start_at: a class moved twice would expire from a date it never aired on.
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, NOW);

    const where = mockFindAll.mock.calls[0][0].where;
    expect(where.scheduled_start_at).toBeUndefined();
    expect(where.content_started_at).toBeUndefined();
  });

  it('CONTROL: the cutoff moves with the clock', async () => {
    // Without this, every assertion above would hold against a frozen constant computed at
    // import — which is exactly the module-scope `Date.now()` the repo's date rule forbids,
    // and which would drift further from correct for every hour the process stayed up.
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, NOW);
    const first = mockFindAll.mock.calls[0][0].where.ended_at[Op.gte].getTime();

    const LATER = NOW + 7 * 86_400_000;
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, LATER);
    const second = mockFindAll.mock.calls[1][0].where.ended_at[Op.gte].getTime();

    expect(second - first).toBe(7 * 86_400_000);
  });

  it('defaults to the real clock when no instant is given', async () => {
    // The production call site passes no instant, so the default has to be live rather than
    // the epoch — a cutoff of 1970 would retain everything and silently void the policy.
    const before = Date.now();
    await findReplayOccurrences();
    const cutoff = mockFindAll.mock.calls[0][0].where.ended_at[Op.gte].getTime();

    expect(cutoff).toBeGreaterThanOrEqual(before - 25 * 86_400_000 - 5_000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - 25 * 86_400_000 + 5_000);
  });

  it('the boundary, from both sides', async () => {
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, NOW);
    const cutoff = mockFindAll.mock.calls[0][0].where.ended_at[Op.gte].getTime();

    // Inside: last week's class, the case the whole feature exists for.
    expect(daysAgo(7).getTime()).toBeGreaterThan(cutoff);
    expect(daysAgo(24).getTime()).toBeGreaterThan(cutoff);
    // Outside: a class from the start of term.
    expect(daysAgo(26).getTime()).toBeLessThan(cutoff);
    expect(daysAgo(90).getTime()).toBeLessThan(cutoff);
  });

  it('excludes a row whose end time was never written, rather than guessing', async () => {
    /**
     * `Op.gte` against NULL is NULL, which is not true, so an undated row is omitted. That is
     * the fail-closed answer: a row that cannot be aged cannot be shown to be inside a window
     * that touches billing. `ended_at` has been written since L7.4, so this concerns only rows
     * predating it — and the surface keeps its "Date not recorded" branch as belt and braces.
     */
    await findReplayOccurrences(REPLAY_DISCOVERY_LIMIT, NOW);
    const where = mockFindAll.mock.calls[0][0].where;
    // Nothing opts NULL back in.
    expect(where.ended_at[Op.or]).toBeUndefined();
    expect(where.ended_at[Op.is]).toBeUndefined();
  });
});

describe('it is a page, not a feed', () => {
  it('is bounded', async () => {
    await findReplayOccurrences();
    expect(mockFindAll.mock.calls[0][0].limit).toBe(REPLAY_DISCOVERY_LIMIT);
  });

  it('lets a caller ask for fewer', async () => {
    await findReplayOccurrences(5);
    expect(mockFindAll.mock.calls[0][0].limit).toBe(5);
  });

  it('orders most recent first, because people look for the class they just missed', async () => {
    await findReplayOccurrences();
    expect(mockFindAll.mock.calls[0][0].order).toEqual([['ended_at', 'DESC']]);
  });
});

describe('it does not disturb the live ticker', () => {
  it('asks a different question from the active list', () => {
    // Widening the ACTIVE states would silently drop that query off its partial index and turn
    // a 45-second poll into a sequential scan. These must stay separate.
    expect([...ACTIVE_DISCOVERY_STATES]).toEqual(['live', 'reconnecting']);
    expect([...REPLAY_DISCOVERY_STATES]).not.toEqual([...ACTIVE_DISCOVERY_STATES]);
  });
});

describe('the shape it returns', () => {
  it('carries what the projection and the entitlement layer both need', async () => {
    const [out] = await findReplayOccurrences();

    // Mapped explicitly rather than spread: Sequelize keeps values behind prototype getters,
    // so a spread would quietly return an object with none of these.
    expect(out).toMatchObject({
      id: 'occ-1', title: 'Week 12 Build Day', room_id: 'room-1',
      access_mode: 'free', editorial_state: 'replay_ready', preview_seconds: 900,
    });
    expect(out.ended_at).toBeInstanceOf(Date);
    expect(out.session_id).toBe('sess-1');
  });

  it('survives an occurrence with no session ref', async () => {
    mockFindSessionIds.mockResolvedValue(new Map());
    const [out] = await findReplayOccurrences();
    expect(out.session_id).toBeNull();
  });

  it('asks for the session ids of exactly the rows it found', async () => {
    await findReplayOccurrences();
    expect(mockFindSessionIds).toHaveBeenCalledWith(['occ-1']);
  });

  it('survives a row shaped like a REAL Sequelize instance', async () => {
    /**
     * The fixture above is a plain object, so spreading it would work and this file could
     * never catch the hazard its own code comment warns about. A mutation that replaced the
     * explicit mapping with a spread SURVIVED for exactly that reason.
     *
     * A Sequelize instance keeps its column values behind getters on the PROTOTYPE, where
     * a spread cannot see them - so this fixture puts them there, and a spread returns an
     * object with every field undefined.
     */
    const proto = {};
    const source = row();
    Object.keys(source).forEach((k) => {
      Object.defineProperty(proto, k, {
        get: () => (source as Record<string, unknown>)[k],
        enumerable: false,
        configurable: true,
      });
    });
    mockFindAll.mockResolvedValue([Object.create(proto)]);

    const [out] = await findReplayOccurrences();

    expect(out.id).toBe('occ-1');
    expect(out.title).toBe('Week 12 Build Day');
    expect(out.access_mode).toBe('free');
    expect(out.preview_seconds).toBe(900);
    expect(out.ended_at).toBeInstanceOf(Date);
  });
});
