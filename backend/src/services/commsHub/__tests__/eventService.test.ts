/**
 * CH2.2 event service against in-memory models: write-through rows, activity in the same unit of
 * work, idempotent edits and cancels, and the state rules.
 */
type Row = Record<string, any>;
const store = new Map<string, FakeEvent>();
let seq = 0;

/**
 * Stores JSON columns the way Postgres JSONB hands them back: object keys reordered (JSONB sorts by
 * key length, then bytes). Without this the fake hid the CH2.2 attempt-1 defect, where an unchanged
 * placement read back as {calendar, campus_rail, events_page} counted as an edit.
 */
const JSON_COLS = ['audience', 'repeat_rule', 'hosts', 'placement'];
function asJsonb(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(asJsonb);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Row;
    return Object.fromEntries(Object.keys(o).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).map((k) => [k, asJsonb(o[k])]));
  }
  return v;
}
function stored(d: Row): Row {
  const out = { ...d };
  for (const c of JSON_COLS) if (c in out) out[c] = asJsonb(out[c]);
  return out;
}
class FakeEvent {
  data: Row;
  constructor(d: Row) { this.data = stored(d); Object.assign(this, this.data); }
  get(k: string) { return this.data[k]; }
  async update(f: Row) { this.data = stored({ ...this.data, ...f, updated_at: new Date() }); Object.assign(this, this.data); return this; }
}

jest.mock('../../../config/database', () => ({
  sequelize: { transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
jest.mock('../../../models/CommsHubEvent', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (d: Row) => {
      seq += 1;
      const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
      const e = new FakeEvent({
        id, event_type: 'other', audience: { kind: 'all_members' }, ends_at: null, repeat_rule: null, join_url: null, registration_url: null,
        hosts: [], description: null, placement: { calendar: true, events_page: true, campus_rail: true }, status: 'scheduled',
        thumbnail_id: null, broadcast_occurrence_id: null, created_at: new Date(), updated_at: new Date(), ...d,
      });
      store.set(id, e);
      return e;
    }),
    findByPk: jest.fn(async (id: string) => store.get(id) ?? null),
    // Honors the one filter the service sends: status equal to a value, or status not equal (Op.ne).
    findAll: jest.fn(async ({ where }: { where: Row }) => [...store.values()].filter((e) => {
      const s = where?.status;
      if (s === undefined) return true;
      if (typeof s === 'string') return e.get('status') === s;
      const ne = Object.getOwnPropertySymbols(s).map((k) => (s as any)[k])[0];
      return e.get('status') !== ne;
    })),
  },
}));
const mockDestroy = jest.fn(async () => 0);
const mockBulk = jest.fn(async (rows: Row[]) => rows);
jest.mock('../../../models/CommunityEvent', () => ({ __esModule: true, default: { destroy: (...a: unknown[]) => mockDestroy(...(a as [])), bulkCreate: (...a: unknown[]) => mockBulk(...(a as [Row[]])) } }));
jest.mock('../../../models/Cohort', () => ({ __esModule: true, default: { findAll: jest.fn(async () => [{ get: () => 'c-open-1' }, { get: () => 'c-open-2' }, { get: () => 'c-open-3' }]) } }));
const mockActivity = jest.fn(async (r: Row) => r);
jest.mock('../../../models/CommsHubActivity', () => ({ __esModule: true, default: { create: (...a: unknown[]) => mockActivity(...(a as [Row])) } }));

import { createEvent, updateEvent, cancelEvent, duplicateEvent, listEvents, EventStateError } from '../eventService';
import { EventInput } from '../eventInput';
import { getSummary } from '../commsHubSummary';

const JACKIE = { id: 'jackie-1', label: 'jackie@colaberry.com' };
const input = (o: Row = {}) => EventInput.parse({ title: 'Demo Tuesday', date: '2026-12-01', start_time: '18:00', end_time: '19:00', ...o });
const actions = () => mockActivity.mock.calls.map((c) => (c[0] as Row).action);

beforeEach(() => { store.clear(); seq = 0; jest.clearAllMocks(); });

describe('CH2.2 create writes through to the calendar', () => {
  it('all members: one row per open cohort, with the hub link, the calendar type and the join link', async () => {
    const v = await createEvent(input({ event_type: 'workshop', join_url: 'https://zoom.us/j/1' }), JACKIE);
    expect(v.central).toEqual({ date: '2026-12-01', start_time: '18:00', end_time: '19:00', label: expect.stringContaining('CST') });
    const rows = mockBulk.mock.calls[0][0];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.hub_event_id === v.id && r.event_type === 'other' && r.location_url === 'https://zoom.us/j/1')).toBe(true);
    expect(mockDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { hub_event_id: v.id } }));
    expect(actions()).toEqual(['event.created']);
  });

  it('chosen cohorts x weekly occurrences', async () => {
    await createEvent(input({ audience: { kind: 'cohorts', cohort_ids: ['11111111-1111-4111-8111-111111111111'] }, repeat: { freq: 'weekly', until: '2026-12-15' } }), JACKIE);
    expect(mockBulk.mock.calls[0][0]).toHaveLength(3);
  });

  it('a draft, or calendar placement off, writes no calendar rows', async () => {
    await createEvent(input({ status: 'draft' }), JACKIE);
    await createEvent(input({ placement: { calendar: false, events_page: true, campus_rail: true } }), JACKIE);
    expect(mockBulk).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });
});

describe('CH2.2 update, duplicate, cancel', () => {
  it('the same payload twice changes nothing and logs one activity row in total, with JSONB key order', async () => {
    const payload = input({ hosts: [{ name: 'Aleem', role: 'Design' }], repeat: { freq: 'weekly', until: '2026-12-29' } });
    const v = await createEvent(payload, JACKIE);
    // Prove the fake really reorders, so this test can fail the way Postgres would make it fail.
    expect(Object.keys(store.get(v.id)!.get('placement'))).toEqual(['calendar', 'campus_rail', 'events_page']);
    await updateEvent(v.id, payload, JACKIE);
    await updateEvent(v.id, payload, JACKIE);
    expect(actions()).toEqual(['event.created']);
    expect(mockDestroy).toHaveBeenCalledTimes(1); // only the create's sync; no re-sync on a no-op save
  });

  it('canonical() ignores key order but not values', async () => {
    const { canonical } = await import('../eventService');
    expect(canonical({ a: 1, b: { c: 2, d: [1, { e: 3, f: 4 }] } })).toBe(canonical({ b: { d: [1, { f: 4, e: 3 }], c: 2 }, a: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical(new Date('2026-12-01T00:00:00Z'))).toBe(canonical(new Date('2026-12-01T00:00:00.000Z')));
  });

  it('a real edit re-syncs the calendar and records which fields changed', async () => {
    const v = await createEvent(input(), JACKIE);
    const after = await updateEvent(v.id, input({ start_time: '17:30', title: 'Demo Tuesday (moved)' }), JACKIE);
    expect(after.central.start_time).toBe('17:30');
    expect(mockDestroy).toHaveBeenCalledTimes(2);
    const detail = (mockActivity.mock.calls[1][0] as Row).detail;
    expect(detail.changed).toEqual(expect.arrayContaining(['title', 'starts_at']));
  });

  it('cancel removes the calendar rows, is idempotent, and a cancelled event cannot be edited', async () => {
    const v = await createEvent(input(), JACKIE);
    const c1 = await cancelEvent(v.id, JACKIE);
    await cancelEvent(v.id, JACKIE);
    expect(c1.status).toBe('cancelled');
    expect(actions()).toEqual(['event.created', 'event.cancelled']);
    expect(mockBulk).toHaveBeenCalledTimes(1);
    await expect(updateEvent(v.id, input(), JACKIE)).rejects.toThrow(EventStateError);
  });

  it('a live event cannot be cancelled until its stream ends', async () => {
    const v = await createEvent(input(), JACKIE);
    await store.get(v.id)!.update({ status: 'live' });
    await expect(cancelEvent(v.id, JACKIE)).rejects.toThrow(/End the live stream/);
  });

  it('duplicate copies everything as a draft with no thumbnail, stream or calendar rows', async () => {
    const v = await createEvent(input({ registration_url: 'https://www.eventbrite.com/e/1' }), JACKIE);
    await store.get(v.id)!.update({ thumbnail_id: '22222222-2222-4222-8222-222222222222' });
    mockBulk.mockClear();
    const d = await duplicateEvent(v.id, JACKIE);
    expect(d).toMatchObject({ title: v.title, registration_url: v.registration_url, status: 'draft', thumbnail_id: null });
    expect(mockBulk).not.toHaveBeenCalled();
  });
});

describe('CH2.2 lists and the Today tiles', () => {
  it('upcoming excludes past and cancelled; the summary counts upcoming events and missing thumbnails', async () => {
    const now = new Date('2026-11-20T12:00:00Z');
    await createEvent(input(), JACKIE);
    const past = await createEvent(input({ date: '2026-10-01' }), JACKIE);
    const cancelled = await createEvent(input({ date: '2026-12-08' }), JACKIE);
    await cancelEvent(cancelled.id, JACKIE);
    const up = await listEvents('upcoming', now);
    expect(up.map((e) => e.central.date)).toEqual(['2026-12-01']);
    expect((await listEvents('past', now)).map((e) => e.id)).toEqual([past.id]);
    const s = await getSummary(now);
    expect(s.upcoming_events).toBe(1);
    expect(s.events_missing_thumbnail).toBe(1);
  });
});
