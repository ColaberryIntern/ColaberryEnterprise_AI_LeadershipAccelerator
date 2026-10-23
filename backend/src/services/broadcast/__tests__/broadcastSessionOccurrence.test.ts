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

import { ensureOccurrenceForSession, isLiveEnabledForSession } from '../broadcastSessionOccurrence';

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
});

describe('isLiveEnabledForSession', () => {
  it('is true when a source ref exists and false when it does not', async () => {
    wireDb([{ id: 'occ-1', occurrence_key: 'k', editorial_state: 'scheduled' }]);
    expect(await isLiveEnabledForSession(SESSION.id)).toBe(true);

    wireDb([]);
    expect(await isLiveEnabledForSession(SESSION.id)).toBe(false);
  });
});
