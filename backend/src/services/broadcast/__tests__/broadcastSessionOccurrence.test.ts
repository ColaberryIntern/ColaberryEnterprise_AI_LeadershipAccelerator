/**
 * L7.1 — the session-to-occurrence creation path.
 *
 * broadcastIdentity is deliberately NOT mocked: the point of these tests is that the real
 * derivation runs, so a guessed instant would show up here rather than in production. The only
 * doubles are the database and the model.
 */

const mockQuery = jest.fn();
const mockTransaction = jest.fn(async (fn: any) => fn('TX'));
jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: any[]) => mockQuery(...a),
    transaction: (fn: any) => mockTransaction(fn),
  },
}));

const mockCreate = jest.fn();
jest.mock('../../../models/BroadcastOccurrence', () => ({
  __esModule: true,
  default: { create: (...a: any[]) => mockCreate(...a) },
}));

jest.spyOn(console, 'warn').mockImplementation(() => undefined);

import {
  ensureOccurrenceForSession,
  isLiveEnabledForSession,
  EnsureOutcome,
  EnsureRefusal,
} from '../broadcastSessionOccurrence';
import { EDITORIAL_STATES, EditorialState } from '../broadcastStateMachine';
import { deriveStartInstant, occurrenceKeyFor } from '../broadcastIdentity';

const SESSION = {
  id: '11111111-2222-3333-4444-555555555555',
  title: 'Week 3 Build Day',
  session_date: '2026-10-20',
  start_time: '09:00',
};

/** Route the two SQL shapes this module issues; `existing` drives the lookup. */
function wireDb(existing: any[] = []) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (/FROM broadcast_source_refs/.test(sql)) return [existing];
    return [[]];
  });
}

const UID = 'ed843de347601f51d2ae57374a645b8a';

beforeEach(() => {
  jest.clearAllMocks();
  // L5.4: creation now resolves a live input first and refuses without one.
  process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID = UID;
  delete process.env.BROADCAST_INPUT_STRATEGY;
  mockTransaction.mockImplementation(async (fn: any) => fn('TX'));
  mockCreate.mockResolvedValue({ id: 'occ-new' });
  wireDb([]);
});

describe('refusals — nothing is ever guessed', () => {
  it('refuses when there is no room, and creates nothing', async () => {
    const r = await ensureOccurrenceForSession(SESSION, null);

    expect(r).toEqual({ outcome: 'refused', occurrenceId: null, reason: 'no_room' });
    // A private occurrence with no room is unreachable by design — room eligibility fails
    // closed on a null room_id — so creating one would be an orphan nobody could watch.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses when the start instant cannot be derived, rather than inventing one', async () => {
    const r = await ensureOccurrenceForSession({ ...SESSION, start_time: null }, 'room-1');

    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('undeterminable_start');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses a time it could not parse, even though a usable-looking Date comes back', async () => {
    // deriveStartInstant returns an instant AND derived:false for an unparseable time, because
    // classInstant silently falls back to 10:00. Trusting the Date is the bug; this asserts the
    // flag is what decides.
    const r = await ensureOccurrenceForSession({ ...SESSION, start_time: 'half nine' }, 'room-1');

    expect(r.outcome).toBe('refused');
    expect(r.detail).toBe('unparseable_time');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('creation', () => {
  it('creates the occurrence PRIVATE and SCHEDULED, with the room and the derived instant', async () => {
    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.outcome).toBe('created');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [fields, opts] = mockCreate.mock.calls[0];
    // The acceptance criterion: the most restrictive access mode, not the most open.
    expect(fields.access_mode).toBe('private');
    expect(fields.editorial_state).toBe('scheduled');
    expect(fields.room_id).toBe('room-1');
    expect(fields.title).toBe('Week 3 Build Day');
    expect(fields.scheduled_start_at).toBeInstanceOf(Date);
    expect(opts).toEqual({ transaction: 'TX' });
  });

  it('binds the occurrence to a live input, or playback has nothing to sign', async () => {
    await ensureOccurrenceForSession(SESSION, 'room-1');
    const fields = mockCreate.mock.calls[0][0];
    expect(fields.provider).toBe('cloudflare');
    expect(fields.provider_session_id).toBe(UID);
  });

  it('REFUSES when no input is configured, rather than creating an unplayable occurrence', async () => {
    // L7.1 shipped exactly this gap: an occurrence that is real, correctly gated, correctly
    // timed, and cannot play. Refusing is the feature.
    delete process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID;

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('no_live_input');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('keys the occurrence on the session and its start instant, floored to the minute', async () => {
    await ensureOccurrenceForSession(SESSION, 'room-1');

    const key: string = mockCreate.mock.calls[0][0].occurrence_key;
    expect(key.startsWith(`live_session:${SESSION.id}:`)).toBe(true);
    // 2026-10-20 09:00 Central is 14:00 UTC (CDT). Asserting the real value, not just a shape,
    // is what would catch a naive-UTC regression in the shared derivation.
    expect(key).toBe(`live_session:${SESSION.id}:2026-10-20T14:00`);
  });

  it('writes the authoritative source ref in the SAME transaction, with no batch id', async () => {
    await ensureOccurrenceForSession(SESSION, 'room-1');

    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT INTO broadcast_source_refs/.test(sql));
    expect(insert).toBeDefined();
    expect(insert![1].transaction).toBe('TX');
    expect(insert![1].replacements).toEqual(expect.objectContaining({
      occurrenceId: 'occ-new', sourceId: SESSION.id,
    }));
    // batch_id exists so a backfill run reverses with one predicate. A row created by normal
    // operation must never look like backfill output, so the column is not written at all.
    expect(insert![0]).not.toMatch(/batch_id/);
  });

  it('treats a lost unique race as convergence, not an error', async () => {
    const err: any = new Error('duplicate key');
    err.name = 'SequelizeUniqueConstraintError';
    mockCreate.mockRejectedValue(err);
    // Nothing on the first lookup, then the row the winner created.
    let call = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM broadcast_source_refs/.test(sql)) {
        call += 1;
        return [call === 1 ? [] : [{ id: 'occ-winner', occurrence_key: 'k', editorial_state: 'scheduled' }]];
      }
      return [[]];
    });

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r).toEqual({ outcome: 'unchanged', occurrenceId: 'occ-winner' });
  });

  it('still throws a real infrastructure error instead of reporting convergence', async () => {
    mockCreate.mockRejectedValue(new Error('connection terminated'));

    await expect(ensureOccurrenceForSession(SESSION, 'room-1')).rejects.toThrow('connection terminated');
  });
});

describe('an occurrence that already exists', () => {
  it('does nothing when the key already matches', async () => {
    wireDb([{
      id: 'occ-1',
      occurrence_key: `live_session:${SESSION.id}:2026-10-20T14:00`,
      editorial_state: 'scheduled',
    }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r).toEqual({ outcome: 'unchanged', occurrenceId: 'occ-1' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls.some(([s]) => /UPDATE broadcast_occurrences/.test(s))).toBe(false);
  });

  it('re-times a rescheduled class instead of minting a second occurrence', async () => {
    // uq_broadcast_source_ref is UNIQUE on (source_type, source_id), so a session holds at most
    // one source-linked occurrence. Re-timing is the only correct move, by constraint.
    wireDb([{ id: 'occ-1', occurrence_key: 'live_session:x:2026-10-19T14:00', editorial_state: 'scheduled' }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r).toEqual({ outcome: 'retimed', occurrenceId: 'occ-1' });
    expect(mockCreate).not.toHaveBeenCalled();
    const update = mockQuery.mock.calls.find(([s]) => /UPDATE broadcast_occurrences/.test(s));
    expect(update).toBeDefined();
    expect(update![0]).toMatch(/version = version \+ 1/);
    expect(update![1].replacements.id).toBe('occ-1');
  });

  it('refuses to move a show that has already gone live', async () => {
    wireDb([{ id: 'occ-1', occurrence_key: 'live_session:x:2026-10-19T14:00', editorial_state: 'live' }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('already_aired');
    expect(mockQuery.mock.calls.some(([s]) => /UPDATE broadcast_occurrences/.test(s))).toBe(false);
  });

  it('refuses to move one that has ended', async () => {
    wireDb([{ id: 'occ-1', occurrence_key: 'live_session:x:2026-10-19T14:00', editorial_state: 'ended' }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.reason).toBe('already_aired');
  });

  /**
   * A CANCELLED SHOW NEVER AIRED, SO IT MUST NOT BE REFUSED AS IF IT HAD.
   *
   * Both land in the same non-retimeable branch and they are not the same event. An aired show
   * is refused to protect history. A cancelled one is refused because it is unreachable
   * forever — `cancelled` has no outbound transition, and the UNIQUE (source_type, source_id)
   * index means no second occurrence can be minted for the session — so re-scheduling the class
   * cannot put it back on air. Telling the operator that show "already aired" sends them looking
   * for a recording of something that never happened.
   */
  it('names cancellation as its own refusal, not as an airing', async () => {
    wireDb([{
      id: 'occ-1',
      occurrence_key: 'live_session:x:2026-10-19T14:00',
      editorial_state: 'cancelled',
    }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.outcome).toBe('refused');
    expect(r.reason).toBe('cancelled');
    // The state still travels in `detail`, so a log reader keeps the exact state either way.
    expect(r.detail).toBe('cancelled');
    expect(mockQuery.mock.calls.some(([s]) => /UPDATE broadcast_occurrences/.test(s))).toBe(false);
  });

  /**
   * NOTHING WAS ASKED FOR, SO NOTHING IS REFUSED — including for a cancelled occurrence.
   *
   * The key check runs before the state check, so an edit that does not move the start instant
   * resolves to `unchanged` whatever state the occurrence is in. That order is deliberate and the
   * alternative is worse: `updateSession` re-runs this on EVERY edit while live is enabled, and
   * `recording_url` is written after every class, so refusing on state alone would log a refusal
   * for every completed class every time its recording lands — a refusal of a request nobody
   * made. The cancelled refusal fires on the case that actually matters, which is an admin
   * trying to move the date.
   */
  it('reports a cancelled occurrence as unchanged when the instant did not move', async () => {
    // Derived rather than written out: the point of the test is the precedence of the two
    // checks, and hard-coding a key means hard-coding the timezone conversion as well — which
    // would turn a rule about ordering into a test about Central time.
    const instant = deriveStartInstant({
      sourceType: 'live_session',
      sourceId: SESSION.id,
      sessionDate: SESSION.session_date,
      rawStartTime: SESSION.start_time,
      // `as any` mirrors the production call site exactly (broadcastSessionOccurrence.ts):
      // `SourceDescriptor` is a discriminated union over six source types, and narrowing it from
      // a literal here would assert a shape this test has no opinion about. Deliberately the
      // same cast, so the test cannot derive a key by a different route than the code does.
    } as any);
    wireDb([{
      id: 'occ-1',
      occurrence_key: occurrenceKeyFor('live_session', SESSION.id, instant.startsAt!),
      editorial_state: 'cancelled',
    }]);

    const r = await ensureOccurrenceForSession(SESSION, 'room-1');

    expect(r.outcome).toBe('unchanged');
    expect(r.reason).toBeUndefined();
  });

  /**
   * EVERY STATE IS PLACED, AND THE COMPILER IS WHAT ENFORCES IT.
   *
   * `Record<EditorialState, …>` cannot be satisfied with a state missing, so adding a ninth
   * editorial state fails the test typecheck until someone decides whether re-timing an
   * occurrence in it is honest. That is the gate this table exists for: the two-reason split
   * above is only correct as long as nobody drops a new state into the wrong bucket by default.
   */
  const EXPECTED: Record<EditorialState, { outcome: EnsureOutcome; reason?: EnsureRefusal }> = {
    scheduled: { outcome: 'retimed' },
    backstage: { outcome: 'retimed' },
    live: { outcome: 'refused', reason: 'already_aired' },
    reconnecting: { outcome: 'refused', reason: 'already_aired' },
    ended: { outcome: 'refused', reason: 'already_aired' },
    processing: { outcome: 'refused', reason: 'already_aired' },
    replay_ready: { outcome: 'refused', reason: 'already_aired' },
    cancelled: { outcome: 'refused', reason: 'cancelled' },
  };

  it.each(EDITORIAL_STATES.map((s) => [s, EXPECTED[s]] as const))(
    're-timing from %s resolves to %o',
    async (state, expected) => {
      wireDb([{
        id: 'occ-1',
        occurrence_key: 'live_session:x:2026-10-19T14:00',
        editorial_state: state,
      }]);

      const r = await ensureOccurrenceForSession(SESSION, 'room-1');

      expect(r.outcome).toBe(expected.outcome);
      expect(r.reason).toBe(expected.reason);
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );
});

describe('isLiveEnabledForSession', () => {
  it('is true when a source ref exists and false when it does not', async () => {
    wireDb([{ id: 'occ-1', occurrence_key: 'k', editorial_state: 'scheduled' }]);
    expect(await isLiveEnabledForSession(SESSION.id)).toBe(true);

    wireDb([]);
    expect(await isLiveEnabledForSession(SESSION.id)).toBe(false);
  });
});
