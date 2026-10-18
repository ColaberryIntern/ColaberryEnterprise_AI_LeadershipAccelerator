/**
 * The room outbox claim is a real queue, and crash recovery is bounded. Against REAL Postgres.
 *
 * Session CC-20261001-q7m4.
 *
 * ## Why this suite exists
 *
 * This programme's register lists the room outbox among the locks "covered only by asserting
 * their SQL contains FOR UPDATE". For this one that was generous: `skipLocked: true` appears
 * exactly once in the repository, in the service itself. There was no test of the claim at all,
 * not even a string assertion - and unlike the other locks on that list, this one RUNS. The
 * drain is scheduled every minute (`server.ts`, gated on `COMMUNITY_ROOMS_ENABLED`, which is
 * `true` in production) and the table holds 284 delivered events dating back to 2026-07-22,
 * 58 of them RSVP reminders that post a real message into a real room.
 *
 * Two concurrent drains are therefore not hypothetical: one tick running past 60 seconds
 * overlaps the next, and a deploy briefly runs the old and new containers together.
 *
 * ## The controls
 *
 * - `claims the same row twice WITHOUT the lock` is the positive control for the claim: the
 *   same selection with `FOR UPDATE SKIP LOCKED` removed, both reads taken before either
 *   write. If it stops producing a double-claim, nothing above it is evidence.
 * - `the pool allows real concurrency` guards the suite against becoming a no-op: with a
 *   single connection the two drains would serialise and pass without the lock doing anything.
 * - The crash-recovery bound is proved by a loop that TERMINATES. Remove `attempts = attempts
 *   + 1` from `recoverStaleProcessing` and the loop runs out of iterations with the row still
 *   claimable, which is the unbounded retry the bound exists to prevent.
 *
 * The handler is mocked - deliberately. What is under test is the claim, not the side effects,
 * and the real handler reaches `googleapis` and the room message service.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name outbox-pg-test -p 55437:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=outbox_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55437/outbox_test \
 *     npx jest -c jest.config.ts src/services/communityRooms/__tests__/roomOutboxClaimRace
 *
 *   docker rm -f outbox-pg-test
 *
 * Port 55437: 55433-55436 belong to the agent-domain, stale-claim, lease and execution-run
 * suites, so all five can run at once. Throwaway credentials, one run, nothing persists. With
 * no `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: it creates its own table from the model and deletes
 * every row in it between tests.
 */
import { QueryTypes } from 'sequelize';

jest.mock('../roomOutboxHandlers', () => ({
  handleRoomEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[roomOutboxClaimRace] SKIPPED: no DATABASE_URL. This suite needs a real Postgres; the '
    + 'docblock has the one-line docker run and the exact command. It is NOT evidence that the '
    + 'outbox claim behaves as a queue, nor that crash recovery terminates, unless it ran.',
  );
}

describeIfDb('the room outbox claim is a queue, and crash recovery is bounded', () => {
  let sequelize: import('sequelize').Sequelize;
  let drainOutbox: typeof import('../roomOutboxService').drainOutbox;
  let emitRoomEvent: typeof import('../roomOutboxService').emitRoomEvent;
  let recoverStaleProcessing: typeof import('../roomOutboxService').recoverStaleProcessing;
  let CRASH_RECOVERY_ERROR: string;
  let CRASH_RECOVERY_EXHAUSTED: string;
  let handleRoomEvent: jest.Mock;

  const AGGREGATE = '99999999-8888-7777-6666-555555555555';

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    ({
      drainOutbox, emitRoomEvent, recoverStaleProcessing,
      CRASH_RECOVERY_ERROR, CRASH_RECOVERY_EXHAUSTED,
    } = await import('../roomOutboxService'));
    ({ handleRoomEvent } = await import('../roomOutboxHandlers') as unknown as { handleRoomEvent: jest.Mock });

    // From the model, so the table and its UNIQUE idempotency_key match what production has.
    const RoomOutboxEvent = (await import('../../../models/RoomOutboxEvent')).default;
    await RoomOutboxEvent.sync();
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS room_outbox_events');
    await sequelize.close();
  });

  beforeEach(async () => {
    handleRoomEvent.mockClear();
    await sequelize.query('DELETE FROM room_outbox_events', { type: QueryTypes.DELETE });
  });

  /** `n` events ready to claim. 'RoomCreated' is a no-op in the real handler too. */
  async function seedReady(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      // id, created_at and updated_at are supplied explicitly. The table `sync()` builds
      // from this model declares all three NOT NULL with NO DEFAULT - Sequelize mints the
      // UUID and the timestamps in JS - whereas production's hand-written DDL defaults
      // them (`gen_random_uuid()`, `now()`). A raw INSERT therefore has to set them here
      // and does not have to there. Measured, not assumed: `\d room_outbox_events` on
      // both.
      const readyAt = new Date(Date.now() - (60 - i) * 1000);
      const rows = await sequelize.query<{ id: string }>(
        `INSERT INTO room_outbox_events
           (id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, status,
            next_attempt_at, created_at, updated_at)
         VALUES (gen_random_uuid(), 'RoomCreated', 'room', $1, '{}', $2, 'pending', $3, NOW(), NOW())
         RETURNING id`,
        { bind: [AGGREGATE, `seed-${i}`, readyAt], type: QueryTypes.SELECT },
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  const countWhere = async (clause: string): Promise<number> => {
    const rows = await sequelize.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM room_outbox_events WHERE ${clause}`,
      { type: QueryTypes.SELECT },
    );
    return Number(rows[0].n);
  };

  const rowOf = async (id: string) => {
    const rows = await sequelize.query<{ status: string; attempts: number; last_error: string | null }>(
      'SELECT status, attempts, last_error FROM room_outbox_events WHERE id = $1',
      { bind: [id], type: QueryTypes.SELECT },
    );
    return rows[0];
  };

  /** Exactly what a crashed worker leaves behind: claimed, then never touched again. */
  const leaveAsCrashed = (id: string) => sequelize.query(
    `UPDATE room_outbox_events SET status = 'processing', updated_at = NOW() - INTERVAL '11 minutes'
      WHERE id = $1`,
    { bind: [id], type: QueryTypes.UPDATE },
  );

  const handledIds = (): string[] => handleRoomEvent.mock.calls.map((c) => c[0].id as string);

  it('the pool allows real concurrency, so two drains genuinely overlap', () => {
    // Without this the suite could pass on a single connection, with the two drains serialised
    // and the lock doing nothing. 20 is the configured max.
    expect(sequelize.config.pool?.max).toBeGreaterThan(1);
  });

  it('TWO CONCURRENT DRAINS split the queue: every event delivered exactly once', async () => {
    await seedReady(6);

    const [a, b] = await Promise.all([drainOutbox(25), drainOutbox(25)]);

    // The property that matters: six events, six deliveries, no event handed to both drains.
    expect(a.claimed + b.claimed).toBe(6);
    expect(handledIds()).toHaveLength(6);
    expect(new Set<string>(handledIds()).size).toBe(6);

    expect(await countWhere("status = 'processed'")).toBe(6);
    expect(await countWhere("status <> 'processed'")).toBe(0);
  });

  it('drains beyond the queue depth get NOTHING rather than blocking or erroring', async () => {
    // What SKIP LOCKED buys: the surplus drains return empty instead of waiting behind a lock.
    await seedReady(2);

    const results = await Promise.all([1, 2, 3, 4].map(() => drainOutbox(25)));

    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(2);
    // Four drains, two events, limit 25 each: how the two land is not specified (the first
    // drain through may take both), but at least two drains must come back empty.
    expect(results.filter((r) => r.claimed === 0).length).toBeGreaterThanOrEqual(2);
    expect(handledIds()).toHaveLength(2);
    expect(new Set<string>(handledIds()).size).toBe(2);
  });

  it('an event still inside its backoff window is not claimable', async () => {
    const [id] = await seedReady(1);
    await sequelize.query(
      "UPDATE room_outbox_events SET status = 'failed', next_attempt_at = NOW() + INTERVAL '1 hour' WHERE id = $1",
      { bind: [id], type: QueryTypes.UPDATE },
    );

    const result = await drainOutbox(25);

    expect(result.claimed).toBe(0);
    expect(handleRoomEvent).not.toHaveBeenCalled();
    expect((await rowOf(id)).status).toBe('failed');
  });

  it('POSITIVE CONTROL: the same selection WITHOUT the lock claims one event twice', async () => {
    // Mandatory. This is the failure the lock prevents. Both reads are taken before either
    // write, which is the interleaving a real race produces, made determinate.
    await seedReady(1);

    const pick = async (): Promise<string> => {
      const rows = await sequelize.query<{ id: string }>(
        `SELECT id FROM room_outbox_events
          WHERE status IN ('pending', 'failed') AND next_attempt_at <= NOW()
          ORDER BY next_attempt_at ASC LIMIT 1`,
        { type: QueryTypes.SELECT },
      );
      return rows[0].id;
    };
    const [first, second] = await Promise.all([pick(), pick()]);

    expect(first).toBe(second); // one event, two unlocked claimants
  });

  it('emit is idempotent on the unique key, even when five emits race', async () => {
    const params = {
      eventType: 'RoomCreated' as const,
      aggregateType: 'room' as const,
      aggregateId: AGGREGATE,
      discriminator: 'race',
    };

    const events = await Promise.all([1, 2, 3, 4, 5].map(() => emitRoomEvent(params)));

    expect(await countWhere('1 = 1')).toBe(1);
    expect(new Set<string>(events.map((e) => e.id)).size).toBe(1);
  });

  it('first crash recovery makes the event claimable again and counts the attempt', async () => {
    const [id] = await seedReady(1);
    await leaveAsCrashed(id);

    await recoverStaleProcessing();

    const row = await rowOf(id);
    expect(row.status).toBe('failed'); // claimable, not dead - one crash is not a death sentence
    expect(row.attempts).toBe(1);
    expect(row.last_error).toBe(CRASH_RECOVERY_ERROR);
  });

  it('CRASH RECOVERY TERMINATES: an event that keeps killing the worker dead-letters', async () => {
    // The bound itself. max_attempts defaults to 6, so a bounded recovery reaches 'dead' within
    // six crashes. Delete the `attempts = attempts + 1` from recoverStaleProcessing and this
    // loop exhausts its iterations with the row still claimable - retried every minute for
    // ever, which is the unbounded retry CLAUDE.md prohibits.
    const [id] = await seedReady(1);

    let crashes = 0;
    let status = '';
    for (let i = 0; i < 20; i += 1) {
      await leaveAsCrashed(id);
      await recoverStaleProcessing();
      crashes += 1;
      status = (await rowOf(id)).status;
      if (status === 'dead') break;
    }

    expect(status).toBe('dead');
    expect(crashes).toBe(6); // exactly max_attempts
    const row = await rowOf(id);
    expect(row.attempts).toBe(6);
    expect(row.last_error).toBe(CRASH_RECOVERY_EXHAUSTED);

    // And a dead event is never claimed again.
    const result = await drainOutbox(25);
    expect(result.claimed).toBe(0);
    expect(handleRoomEvent).not.toHaveBeenCalled();
  });
});
