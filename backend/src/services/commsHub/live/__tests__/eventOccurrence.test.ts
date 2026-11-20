/** CH5.1 a hub event becomes a broadcast occurrence: one per date, idempotent, typed refusals, who may watch. */
type Row = Record<string, any>;
const refs = new Map<string, { id: string; occurrence_key: string; editorial_state: string }>();
const updates: Row[] = [];
let created = 0;
let raceOnce = false;
let mockRoomsEnabled = true;

jest.mock('../../../../config/env', () => ({ env: { get communityRoomsEnabled() { return mockRoomsEnabled; } } }));
jest.mock('../../../../config/database', () => {
  const pending: Row = {};
  return {
    sequelize: {
      transaction: jest.fn(async (cb: (t: unknown) => unknown) => {
        const out = await cb({});
        if (pending.ref) { refs.set(pending.ref.source_id, pending.ref.row); pending.ref = null; }
        return out;
      }),
      query: jest.fn(async (sql: string, opts: Row) => {
        const r = opts.replacements;
        if (/^\s*SELECT/.test(sql)) { const hit = refs.get(r.sid); return [hit ? [hit] : []]; }
        if (/INSERT INTO broadcast_source_refs/.test(sql)) {
          if (raceOnce) { raceOnce = false; refs.set(r.sourceId, { id: 'winner', occurrence_key: 'k', editorial_state: 'scheduled' }); const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e; }
          pending.ref = { source_id: r.sourceId, row: { id: r.occurrenceId, occurrence_key: lastKey, editorial_state: 'scheduled' } };
          return [[]];
        }
        if (/UPDATE broadcast_occurrences/.test(sql)) { updates.push(r); const row = [...refs.values()].find((x) => x.id === r.id)!; row.occurrence_key = r.key; return [[]]; }
        throw new Error(`unexpected sql ${sql}`);
      }),
    },
  };
});
let lastKey = '';
const mockCreate = jest.fn(async (row: Row) => { created += 1; lastKey = row.occurrence_key; return { id: `occ${created}`, ...row }; });
jest.mock('../../../../models/BroadcastOccurrence', () => ({ __esModule: true, default: { create: (...a: unknown[]) => mockCreate(...(a as [Row])) } }));
const cohorts: Record<string, Row> = { c1: { id: 'c1', name: 'November 2026', cohort_type: 'accelerator' }, c9: { id: 'c9', name: 'Explorer', cohort_type: 'explorer' } };
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: {} }));
jest.mock('../../../../models/Cohort', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => cohorts[id] ?? null) } }));
jest.mock('../../../communityRooms/cohortRoomService', () => ({ ensureRoomForCohort: jest.fn(async (c: Row) => (c.cohort_type === 'accelerator' ? { id: `room-${c.id}` } : null)) }));

import { ensureOccurrenceForCommunityEvent, LiveRefusedError, pickOccurrence, sourceIdFor } from '../eventOccurrence';

const LIVE_ENV = { BROADCAST_INPUT_STRATEGY: process.env.BROADCAST_INPUT_STRATEGY, CLOUDFLARE_STREAM_LIVE_INPUT_UID: process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID };
const NOW = new Date('2026-11-20T15:00:00Z');
const UID = 'a'.repeat(32);
// 6:00 PM CST Tue Dec 1 = 00:00Z Dec 2.
const ev = (o: Row = {}): any => {
  const e: Row = { id: 'e1', title: 'Demo Tuesday', status: 'scheduled', audience: { kind: 'all_members' }, starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: new Date('2026-12-02T01:00:00Z'), repeat_rule: null, broadcast_occurrence_id: null, ...o };
  e.update = jest.fn(async (p: Row) => Object.assign(e, p));
  return e;
};
const refusal = async (p: Promise<unknown>): Promise<string> => { try { await p; return 'none'; } catch (err) { if (err instanceof LiveRefusedError) return err.reason; throw err; } };

beforeEach(() => {
  refs.clear(); updates.length = 0; created = 0; raceOnce = false; mockRoomsEnabled = true; jest.clearAllMocks();
  process.env.BROADCAST_INPUT_STRATEGY = 'shared';
  process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID = UID;
});
afterAll(() => { Object.assign(process.env, LIVE_ENV); });

describe('CH5.1 happy path and idempotency', () => {
  it('all members: a scheduled, free occurrence with no room, on the shared input, linked on the event', async () => {
    const e = ev();
    const r = await ensureOccurrenceForCommunityEvent(e, null, NOW);
    expect(r).toMatchObject({ outcome: 'created', occurrenceId: 'occ1', accessMode: 'free', roomId: null });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      access_mode: 'free', room_id: null, editorial_state: 'scheduled', provider: 'cloudflare', provider_session_id: UID,
      scheduled_start_at: new Date('2026-12-02T00:00:00Z'), occurrence_key: 'community_event:e1@2026-12-01:2026-12-02T00:00',
    });
    expect(refs.has('e1@2026-12-01')).toBe(true);
    expect(e.broadcast_occurrence_id).toBe('occ1');
  });

  it('called twice: the same occurrence, nothing new written', async () => {
    const e = ev();
    const a = await ensureOccurrenceForCommunityEvent(e, null, NOW);
    const b = await ensureOccurrenceForCommunityEvent(e, null, NOW);
    expect(b).toMatchObject({ outcome: 'unchanged', occurrenceId: a.occurrenceId });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(e.update).toHaveBeenCalledTimes(1);
  });

  it('a lost race converges on the row that won', async () => {
    raceOnce = true;
    expect(await ensureOccurrenceForCommunityEvent(ev(), null, NOW)).toMatchObject({ outcome: 'unchanged', occurrenceId: 'winner' });
  });
});

describe('CH5.1 a recurring event: one occurrence per date', () => {
  const weekly = (): any => ev({ repeat_rule: { freq: 'weekly', until: '2027-01-31' } });
  it('the next date by default; each date has its own source id and occurrence', async () => {
    const e = weekly();
    const first = await ensureOccurrenceForCommunityEvent(e, null, NOW);
    const second = await ensureOccurrenceForCommunityEvent(e, new Date('2026-12-09T00:00:00Z'), NOW);
    expect(first.occurrenceId).not.toBe(second.occurrenceId);
    expect([...refs.keys()]).toEqual(['e1@2026-12-01', 'e1@2026-12-08']);
    expect(e.broadcast_occurrence_id).toBe(second.occurrenceId);
  });

  it('after the first date has ended, the next date is picked', () => {
    expect(pickOccurrence(weekly(), null, new Date('2026-12-02T02:00:00Z'))!.toISOString()).toBe('2026-12-09T00:00:00.000Z');
  });

  it('a time that is not one of the event\'s dates is refused', async () => {
    expect(await refusal(ensureOccurrenceForCommunityEvent(weekly(), new Date('2026-12-03T00:00:00Z'), NOW))).toBe('not_a_date_of_this_event');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sourceIdFor uses the Central date (6 PM CST on Dec 1 is Dec 2 in UTC)', () => {
    expect(sourceIdFor('e1', new Date('2026-12-02T00:00:00Z'))).toBe('e1@2026-12-01');
  });
});

describe('CH5.1 re-timing the same date', () => {
  it('a scheduled occurrence moves with the event', async () => {
    await ensureOccurrenceForCommunityEvent(ev(), null, NOW);
    const later = ev({ starts_at: new Date('2026-12-02T01:00:00Z'), ends_at: new Date('2026-12-02T02:00:00Z') });
    expect(await ensureOccurrenceForCommunityEvent(later, null, NOW)).toMatchObject({ outcome: 'retimed', occurrenceId: 'occ1' });
    expect(updates[0]).toMatchObject({ key: 'community_event:e1@2026-12-01:2026-12-02T01:00', id: 'occ1' });
  });

  it.each([['live', 'already_aired'], ['ended', 'already_aired'], ['cancelled', 'cancelled']])('a %s occurrence is not moved: %s', async (state, reason) => {
    refs.set('e1@2026-12-01', { id: 'old', occurrence_key: 'community_event:e1@2026-12-01:2026-12-01T23:00', editorial_state: state });
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev(), null, NOW))).toBe(reason);
    expect(updates).toEqual([]);
  });
});

describe('CH5.1 refusals are typed and write nothing', () => {
  it('no live input configured', async () => {
    delete process.env.CLOUDFLARE_STREAM_LIVE_INPUT_UID;
    const e = ev();
    const err = await ensureOccurrenceForCommunityEvent(e, null, NOW).catch((x) => x);
    expect(err).toBeInstanceOf(LiveRefusedError);
    expect(err.reason).toBe('no_live_input');
    expect(err.message).toBe('No live stream input is set up on this server, so this event cannot go live.');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
  });

  it('no date left to stream (a one-off that is over)', async () => {
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev(), null, new Date('2026-12-05T00:00:00Z')))).toBe('undeterminable_start');
  });

  it('a cancelled or ended event', async () => {
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ status: 'cancelled' }), null, NOW))).toBe('event_closed');
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ status: 'ended' }), null, NOW))).toBe('event_closed');
  });
});

describe('CH5.1 who may watch', () => {
  it('one batch cohort: private, in that batch\'s room', async () => {
    const r = await ensureOccurrenceForCommunityEvent(ev({ audience: { kind: 'cohorts', cohort_ids: ['c1'] } }), null, NOW);
    expect(r).toMatchObject({ accessMode: 'private', roomId: 'room-c1' });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ access_mode: 'private', room_id: 'room-c1' });
  });

  it('several cohorts, a non-batch cohort, rooms switched off, an unknown cohort: refused, nothing written', async () => {
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ audience: { kind: 'cohorts', cohort_ids: ['c1', 'c9'] } }), null, NOW))).toBe('several_cohorts');
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ audience: { kind: 'cohorts', cohort_ids: ['c9'] } }), null, NOW))).toBe('no_room');
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ audience: { kind: 'cohorts', cohort_ids: ['zz'] } }), null, NOW))).toBe('no_room');
    mockRoomsEnabled = false;
    expect(await refusal(ensureOccurrenceForCommunityEvent(ev({ audience: { kind: 'cohorts', cohort_ids: ['c1'] } }), null, NOW))).toBe('no_room');
    expect(mockCreate).not.toHaveBeenCalled();
  });

});
