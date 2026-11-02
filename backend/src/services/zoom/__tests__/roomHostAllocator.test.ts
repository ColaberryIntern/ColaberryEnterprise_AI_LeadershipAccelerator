/**
 * Room -> Zoom host allocation.
 *
 * THE DEFECT THESE PIN. Every persistent room minted its year-long Zoom meeting with
 * no host, so all of them belonged to the single `ZOOM_HOST_EMAIL`. A Zoom user hosts
 * one meeting at a time, so the interns standup could not open while the public AI
 * session was live: you had to end one call to start the other.
 *
 * The first test is the most important one in the file, and it asserts that NOTHING
 * CHANGES. An empty host pool is the normal state until an operator registers a second
 * host, and in that state this feature must be indistinguishable from its absence.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn((cb: any) => cb({ FAKE_TX: true })) },
}));
jest.mock('../../../config/env', () => ({ env: { zoomHostEmail: 'classes@colaberry.com' } }));
jest.mock('../zoomHostRegistry', () => ({ allocatableHostEmails: jest.fn() }));

import { sequelize } from '../../../config/database';
import { allocatableHostEmails } from '../zoomHostRegistry';
import {
  pickLeastLoaded,
  reserveRoomHost,
  roomsSharingAHost,
  ROOM_HOST_PURPOSE,
} from '../roomHostAllocator';

const query = sequelize.query as unknown as jest.Mock;
const pool = allocatableHostEmails as unknown as jest.Mock;

const DEFAULT_HOST = 'classes@colaberry.com';

/**
 * Answer each statement by what it is, not by call order — the allocator short-circuits
 * on an existing reservation, so a positional queue would silently drift.
 */
function givenDatabase(opts: { reservedFor?: string | null; usage?: Record<string, number> }) {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('pg_advisory_xact_lock')) return [[], {}];
    if (text.includes('WHERE id = :id')) return [[{ host: opts.reservedFor ?? null }], {}];
    if (text.includes('GROUP BY 1')) {
      return [Object.entries(opts.usage ?? {}).map(([host, n]) => ({ host, n })), {}];
    }
    return [[], {}];
  });
}

const updates = () => query.mock.calls.filter((c) => String(c[0]).includes('UPDATE community_rooms'));
const reservedHost = () => (updates()[0]?.[1] as { replacements: { host: string } }).replacements.host;

beforeEach(() => jest.clearAllMocks());

describe('an unconfigured pool changes nothing', () => {
  it('reserves no host and writes nothing when no host is registered', async () => {
    pool.mockResolvedValue([]);
    givenDatabase({});

    // null means "pass no host", which is the pre-existing fallback to ZOOM_HOST_EMAIL.
    await expect(reserveRoomHost('room-1')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('asks the registry for a purpose a default registration already satisfies', async () => {
    pool.mockResolvedValue([]);
    await reserveRoomHost('room-1');
    // 'any' is the registry's default purpose and matches this one, so an operator
    // adding a host needs no extra flag for rooms to start using it.
    expect(pool).toHaveBeenCalledWith(ROOM_HOST_PURPOSE);
  });

  it('refuses an empty room id without touching the database (boundary)', async () => {
    pool.mockResolvedValue(['a@colaberry.com']);
    givenDatabase({});
    await expect(reserveRoomHost('')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('choosing the least loaded host', () => {
  it('sends a second room to a different host (the whole point)', () => {
    const chosen = pickLeastLoaded(
      ['a@colaberry.com', 'b@colaberry.com'],
      new Map([['a@colaberry.com', 1]]),
    );
    expect(chosen).toBe('b@colaberry.com');
  });

  it('counts rooms minted before this feature against the DEFAULT host', () => {
    // The two existing rooms have no recorded host; their links belong to the default.
    // Ignoring that is how the first allocation hands a new room the one busy host.
    const chosen = pickLeastLoaded(
      [DEFAULT_HOST, 'spare@colaberry.com'],
      new Map([[DEFAULT_HOST, 2]]),
    );
    expect(chosen).toBe('spare@colaberry.com');
  });

  it('breaks ties by registry priority, so allocation is reproducible', () => {
    const order = ['first@colaberry.com', 'second@colaberry.com', 'third@colaberry.com'];
    expect(pickLeastLoaded(order, new Map())).toBe('first@colaberry.com');
    // Not whichever row Postgres happened to return first.
    expect(pickLeastLoaded(order, new Map())).toBe('first@colaberry.com');
  });

  it('ignores load on a host that is not allocatable', () => {
    // A disabled or unverified host cannot be chosen, so what it carries is irrelevant.
    const chosen = pickLeastLoaded(
      ['a@colaberry.com'],
      new Map([['retired@colaberry.com', 99], ['a@colaberry.com', 3]]),
    );
    expect(chosen).toBe('a@colaberry.com');
  });

  it('still answers when the pool holds one host (capacity is then honestly one)', () => {
    // Not null: one host is better than none, and roomsSharingAHost is what makes the
    // remaining collision visible rather than silent.
    expect(pickLeastLoaded(['only@colaberry.com'], new Map([['only@colaberry.com', 5]])))
      .toBe('only@colaberry.com');
  });

  it('returns null for an empty pool (boundary)', () => {
    expect(pickLeastLoaded([], new Map())).toBeNull();
  });

  it('treats host case as insignificant', () => {
    // The registry lowercases on write; a legacy ZOOM_HOST_EMAIL may not be.
    const chosen = pickLeastLoaded(
      ['Mixed@Colaberry.com', 'other@colaberry.com'],
      new Map([['mixed@colaberry.com', 4]]),
    );
    expect(chosen).toBe('other@colaberry.com');
  });
});

describe('reserving a host', () => {
  it('records the chosen host on the room', async () => {
    pool.mockResolvedValue([DEFAULT_HOST, 'spare@colaberry.com']);
    givenDatabase({ usage: { [DEFAULT_HOST]: 2 } });

    await expect(reserveRoomHost('room-1')).resolves.toBe('spare@colaberry.com');
    expect(updates()).toHaveLength(1);
    expect(reservedHost()).toBe('spare@colaberry.com');
  });

  it('does not reserve twice for the same room (idempotency)', async () => {
    // A re-run of the provisioning service must not move a room to another host: the
    // join link is already minted there, and reconciling a lost response asks the host
    // the first attempt recorded.
    pool.mockResolvedValue([DEFAULT_HOST, 'spare@colaberry.com']);
    givenDatabase({ reservedFor: 'spare@colaberry.com', usage: { [DEFAULT_HOST]: 9 } });

    await expect(reserveRoomHost('room-1')).resolves.toBe('spare@colaberry.com');
    expect(updates()).toHaveLength(0);
  });

  it('takes the allocation lock before reading what is reserved', async () => {
    pool.mockResolvedValue(['a@colaberry.com']);
    givenDatabase({});
    await reserveRoomHost('room-1');

    const statements = query.mock.calls.map((c) => String(c[0]));
    const lock = statements.findIndex((s) => s.includes('pg_advisory_xact_lock'));
    const read = statements.findIndex((s) => s.includes('WHERE id = :id'));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(read);
  });

  it('does all of it inside one transaction', async () => {
    pool.mockResolvedValue(['a@colaberry.com']);
    givenDatabase({});
    await reserveRoomHost('room-1');

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const call of query.mock.calls) {
      expect((call[1] as { transaction?: unknown }).transaction).toEqual({ FAKE_TX: true });
    }
  });

  it('counts a reservation that has no link yet', async () => {
    // Pins the clause, not the query: two rooms provisioned together reserve seconds
    // apart and neither has minted a link, so counting only linked rooms would let both
    // pick the same host — the original defect, reintroduced by its own fix.
    pool.mockResolvedValue(['a@colaberry.com']);
    givenDatabase({});
    await reserveRoomHost('room-1');

    const usageSql = query.mock.calls.map((c) => String(c[0])).find((s) => s.includes('GROUP BY 1'));
    expect(usageSql).toContain('meeting_link IS NOT NULL');
    expect(usageSql).toContain('OR');
    expect(usageSql).toContain("metadata->>'zoom_host_email'");
  });
});

describe('a broken registry must not break joining a room', () => {
  it('degrades to the default host when the pool read throws (failure path)', async () => {
    // Before the pool existed, a join could not fail because of the host registry.
    // It still must not: null means "use ZOOM_HOST_EMAIL", which is the old behavior.
    pool.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { error_class: 'UpstreamUnavailable' }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reserveRoomHost('room-1')).resolves.toBeNull();
  });

  it('degrades when the reservation transaction throws', async () => {
    pool.mockResolvedValue(['a@colaberry.com']);
    (sequelize.transaction as unknown as jest.Mock).mockRejectedValueOnce(new Error('deadlock detected'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(reserveRoomHost('room-1')).resolves.toBeNull();
  });

  it('logs the degrade rather than swallowing it', async () => {
    // A pool that is silently never consulted looks exactly like one that works, and
    // the collision this feature exists to end would come back unnoticed.
    pool.mockRejectedValue(new Error('boom'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await reserveRoomHost('room-1');

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe('room_host_reservation_failed');
    expect(logged.outcome).toBe('failure');
    expect(logged.context.degraded_to).toBe('default_host');
  });
});

describe('reporting a collision', () => {
  it('names the hosts carrying more than one room', async () => {
    query.mockReset();
    query.mockResolvedValue([
      [{ host_email: DEFAULT_HOST, room_count: 2, rooms: ['AI Internship', 'Colaberry AI Sessions'] }],
      {},
    ]);

    await expect(roomsSharingAHost()).resolves.toEqual([
      { host_email: DEFAULT_HOST, room_count: 2, rooms: ['AI Internship', 'Colaberry AI Sessions'] },
    ]);
  });

  it('is empty when every room has its own host', async () => {
    query.mockReset();
    query.mockResolvedValue([[], {}]);
    await expect(roomsSharingAHost()).resolves.toEqual([]);
  });
});
