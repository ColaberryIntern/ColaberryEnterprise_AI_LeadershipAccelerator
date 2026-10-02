jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/LiveSession', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

import { sequelize } from '../../../config/database';
import LiveSession from '../../../models/LiveSession';
import { reserveSlot, releaseSlot, nextAvailableFrom, collidingClassWindows } from '../presentationCapacityService';

const q = sequelize.query as unknown as jest.Mock;
const sessions = (LiveSession as unknown as { findAll: jest.Mock }).findAll;

/** Well in the future so the in-the-past guard never interferes. */
const START = new Date('2026-11-04T19:00:00Z');
const END = new Date('2026-11-04T19:30:00Z');

const req = (over: Record<string, unknown> = {}) => ({
  enrollmentId: 'e1', startAt: START, endAt: END, ...over,
} as any);

/** Postgres raises 23P01 when the exclusion constraint rejects an overlap. */
const exclusionViolation = () =>
  Object.assign(new Error('conflicting key value violates exclusion constraint "presentation_slot_no_overlap"'),
    { parent: { code: '23P01' } });

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  sessions.mockResolvedValue([]);          // no classes unless a test adds one
});

describe('capacity — the happy path', () => {
  it('reserves the slot as a half-open range so back-to-back bookings do not collide', async () => {
    q.mockResolvedValueOnce([[{ id: 'res-1' }], {}]);
    const r = await reserveSlot(req());
    expect(r).toMatchObject({ ok: true, reservationId: 'res-1' });
    // '[)' matters: a slot ending at 19:30 must not block one starting at 19:30.
    expect(String(q.mock.calls[0][0])).toContain("tstzrange(:s, :e, '[)')");
  });

  it('records who holds it and in what mode', async () => {
    q.mockResolvedValueOnce([[{ id: 'res-2' }], {}]);
    await reserveSlot(req({ mode: 'practice_peer', attemptId: 'att-9' }));
    const vals = q.mock.calls[0][1].replacements;
    expect(vals).toMatchObject({ eid: 'e1', mode: 'practice_peer', aid: 'att-9' });
  });
});

describe('capacity — two students, one host', () => {
  it('the loser gets a refusal AND a real next-available time, never a dead end', async () => {
    // "Unavailable" with no alternative is how a student decides the feature is broken.
    q.mockRejectedValueOnce(exclusionViolation());
    q.mockResolvedValueOnce([[{ s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' }], {}]); // nextAvailable lookup

    const r = await reserveSlot(req());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('taken');
    expect(r.nextAvailable).toBeInstanceOf(Date);
    expect(r.message).toMatch(/next free time/i);
  });

  it('overlap is decided by the DATABASE, not by a check in the service', async () => {
    // A SELECT-then-INSERT would let two simultaneous clicks both read "free".
    // The service must insert first and interpret the constraint's refusal.
    q.mockResolvedValueOnce([[{ id: 'res-3' }], {}]);
    await reserveSlot(req());
    const firstSql = String(q.mock.calls[0][0]);
    expect(firstSql).toMatch(/INSERT INTO presentation_slot_reservations/);
    expect(firstSql).not.toMatch(/SELECT .* FROM presentation_slot_reservations/i);
  });

  it('a non-overlap database error is NOT swallowed as "taken"', async () => {
    // Reporting a dropped connection as "someone took your slot" would send a student
    // hunting for a conflict that does not exist.
    q.mockRejectedValueOnce(Object.assign(new Error('connection terminated'), { parent: { code: '08006' } }));
    await expect(reserveSlot(req())).rejects.toThrow('connection terminated');
  });
});

describe('capacity — classes own the host', () => {
  it('refuses a practice slot that overlaps a scheduled class', async () => {
    // 2026-11-04 18:30-20:30 Central is 00:30-02:30Z on the 5th; the requested
    // 19:00-19:30Z is NOT inside that. Use a class that genuinely overlaps instead.
    sessions.mockResolvedValue([
      { session_date: '2026-11-04', start_time: '13:00', end_time: '14:00', title: 'Week 11 · Build Day' },
    ]);
    q.mockResolvedValueOnce([[], {}]);   // nextAvailable: nothing else held

    const r = await reserveSlot(req());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('class_window');
    expect(r.message).toContain('Week 11 · Build Day');
  });

  it('allows a slot that clears the class plus its guard margin', async () => {
    sessions.mockResolvedValue([
      { session_date: '2026-11-04', start_time: '08:00', end_time: '09:00', title: 'Morning class' },
    ]);
    q.mockResolvedValueOnce([[{ id: 'res-4' }], {}]);
    await expect(reserveSlot(req())).resolves.toMatchObject({ ok: true });
  });

  it('uses classInstant, not a naive date+time parse', async () => {
    // The naive parse is off by the UTC offset and has caused a P0 on this data.
    // 13:00 Central on 2026-11-04 (CST, UTC-6) is 19:00Z — so this class DOES collide
    // with a 19:00Z request. A naive parse would read 13:00Z and miss it entirely.
    sessions.mockResolvedValue([
      { session_date: '2026-11-04', start_time: '13:00', end_time: '14:00', title: 'Collides only if converted' },
    ]);
    const hits = await collidingClassWindows(START, END);
    expect(hits).toHaveLength(1);
  });

  it('a class with no end time still blocks a sensible window rather than nothing', async () => {
    sessions.mockResolvedValue([
      { session_date: '2026-11-04', start_time: '13:00', end_time: null, title: 'Open-ended' },
    ]);
    expect(await collidingClassWindows(START, END)).toHaveLength(1);
  });
});

describe('capacity — next available', () => {
  it('returns the requested time when nothing is in the way', async () => {
    q.mockResolvedValueOnce([[], {}]);
    await expect(nextAvailableFrom(START, 30)).resolves.toEqual(START);
  });

  it('skips past a held slot to the first gap that actually fits', async () => {
    q.mockResolvedValueOnce([[{ s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' }], {}]);
    const next = await nextAvailableFrom(START, 30);
    expect(next).toEqual(new Date('2026-11-04T19:30:00Z'));
  });

  it('does not offer a gap too small for the requested duration', async () => {
    // A 15-minute hole cannot hold a 30-minute rehearsal; the answer must be after both.
    q.mockResolvedValueOnce([[
      { s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' },
      { s: '2026-11-04T19:45:00Z', e: '2026-11-04T20:15:00Z' },
    ], {}]);
    const next = await nextAvailableFrom(START, 30);
    expect(next).toEqual(new Date('2026-11-04T20:15:00Z'));
  });
});

describe('capacity — releasing', () => {
  it('frees the slot by flipping state, keeping the row for history', async () => {
    q.mockResolvedValueOnce([[{ id: 'res-1' }], {}]);
    await expect(releaseSlot('res-1', 'student cancelled')).resolves.toBe(true);
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/SET state = 'released'/);
    expect(sql).not.toMatch(/DELETE/i);
    // Only a held reservation can be released — releasing twice must not resurrect it.
    expect(sql).toMatch(/AND state = 'held'/);
  });

  it('reports false when there was nothing held to release', async () => {
    q.mockResolvedValueOnce([[], {}]);
    await expect(releaseSlot('nope', 'x')).resolves.toBe(false);
  });
});

describe('capacity — boundaries', () => {
  it('refuses a slot in the past instead of booking a meeting nobody can attend', async () => {
    const r = await reserveSlot(req({ startAt: new Date('2020-01-01T10:00:00Z'), endAt: new Date('2020-01-01T10:30:00Z') }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('in_the_past');
    expect(q).not.toHaveBeenCalled();
  });
});
