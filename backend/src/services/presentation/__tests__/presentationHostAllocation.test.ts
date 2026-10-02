jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/LiveSession', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../zoom/zoomHostRegistry', () => ({ allocatableHostEmails: jest.fn() }));

import { sequelize } from '../../../config/database';
import LiveSession from '../../../models/LiveSession';
import { allocatableHostEmails } from '../../zoom/zoomHostRegistry';
import { reserveSlot, nextAvailableFrom, saturatedIntervals } from '../presentationCapacityService';

const q = sequelize.query as unknown as jest.Mock;
const sessions = (LiveSession as unknown as { findAll: jest.Mock }).findAll;
const hostPool = allocatableHostEmails as unknown as jest.Mock;

const START = new Date('2026-11-04T19:00:00Z');
const END = new Date('2026-11-04T19:30:00Z');
const req = (over: Record<string, unknown> = {}) => ({ enrollmentId: 'e1', startAt: START, endAt: END, ...over } as any);

const exclusionViolation = () =>
  Object.assign(new Error('conflicting key value violates exclusion constraint "presentation_slot_no_overlap_per_host"'),
    { parent: { code: '23P01' } });

const inserts = () => q.mock.calls.filter((c: any[]) => String(c[0]).includes('INSERT INTO presentation_slot_reservations'));
const hostsTried = () => inserts().map((c: any[]) => c[1].replacements.host);

beforeEach(() => {
  jest.clearAllMocks();
  q.mockReset();
  sessions.mockResolvedValue([]);
  hostPool.mockResolvedValue([]);
});

describe('allocation asks the database, never a read-then-write', () => {
  it('with no registered hosts, behaves exactly as the single-host platform did', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1' }], {}]);
    const r = await reserveSlot(req());

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The empty pseudo-host every pre-existing row already uses.
    expect(hostsTried()).toEqual(['']);
    expect(r.hostEmail).toBeNull();
  });

  it('takes the first host in priority order when it is free', async () => {
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com']);
    q.mockResolvedValueOnce([[{ id: 'r1' }], {}]);

    const r = await reserveSlot(req());

    expect(hostsTried()).toEqual(['a@x.com']);
    if (!r.ok) return;
    expect(r.hostEmail).toBe('a@x.com');
  });

  it('moves to the next host when the first is busy, instead of refusing', async () => {
    // THE WHOLE POINT. Before this, one busy host meant the platform was full.
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com']);
    q.mockRejectedValueOnce(exclusionViolation());
    q.mockResolvedValueOnce([[{ id: 'r2' }], {}]);

    const r = await reserveSlot(req());

    expect(hostsTried()).toEqual(['a@x.com', 'b@x.com']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hostEmail).toBe('b@x.com');
  });

  it('only says "taken" once EVERY host has refused', async () => {
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com']);
    q.mockRejectedValueOnce(exclusionViolation());
    q.mockRejectedValueOnce(exclusionViolation());
    q.mockResolvedValueOnce([[], {}]); // nextAvailable lookup

    const r = await reserveSlot(req());

    expect(hostsTried()).toEqual(['a@x.com', 'b@x.com']);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('taken');
    expect(r.message).toMatch(/every practice room is busy/i);
  });

  it('never tries a second host after an error that is NOT a conflict', async () => {
    // A dropped connection is not "this host is busy". Walking the pool on a real
    // fault would hammer every host in turn and bury the actual cause.
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com']);
    q.mockRejectedValueOnce(Object.assign(new Error('connection terminated'), { parent: { code: '08006' } }));

    await expect(reserveSlot(req())).rejects.toThrow('connection terminated');
    expect(hostsTried()).toEqual(['a@x.com']);
  });

  it('writes the chosen host onto the reservation row', async () => {
    hostPool.mockResolvedValue(['only@x.com']);
    q.mockResolvedValueOnce([[{ id: 'r1' }], {}]);
    await reserveSlot(req());
    expect(String(inserts()[0][0])).toContain('host_email');
    expect(inserts()[0][1].replacements.host).toBe('only@x.com');
  });
});

describe('a time is only unavailable when every host is busy', () => {
  const iv = (s: string, e: string) => ({ start: new Date(s), end: new Date(e) });

  it('with one host, any held slot blocks — the old behaviour, unchanged', () => {
    const out = saturatedIntervals([iv('2026-11-04T19:00:00Z', '2026-11-04T19:30:00Z')], 1);
    expect(out).toEqual([iv('2026-11-04T19:00:00Z', '2026-11-04T19:30:00Z')]);
  });

  it('with two hosts, a single booking blocks nothing', () => {
    const out = saturatedIntervals([iv('2026-11-04T19:00:00Z', '2026-11-04T19:30:00Z')], 2);
    expect(out).toEqual([]);
  });

  it('with two hosts, only the overlap of two bookings blocks', () => {
    const out = saturatedIntervals([
      iv('2026-11-04T19:00:00Z', '2026-11-04T19:30:00Z'),
      iv('2026-11-04T19:15:00Z', '2026-11-04T19:45:00Z'),
    ], 2);
    expect(out).toEqual([iv('2026-11-04T19:15:00Z', '2026-11-04T19:30:00Z')]);
  });

  it('back-to-back bookings never count as concurrent', () => {
    // A slot ending at 19:30 does not keep a host busy for one starting at 19:30 —
    // the range is half-open and the sweep has to agree with it.
    const out = saturatedIntervals([
      iv('2026-11-04T19:00:00Z', '2026-11-04T19:30:00Z'),
      iv('2026-11-04T19:30:00Z', '2026-11-04T20:00:00Z'),
    ], 2);
    expect(out).toEqual([]);
  });

  it('offers the requested time even when one of two hosts is already booked', async () => {
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com']);
    q.mockResolvedValueOnce([[{ s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' }], {}]);

    const next = await nextAvailableFrom(START, 30);

    // One booking, two hosts: the asked-for time is still free.
    expect(next).toEqual(START);
  });

  it('skips past the window where both hosts are booked', async () => {
    hostPool.mockResolvedValue(['a@x.com', 'b@x.com']);
    q.mockResolvedValueOnce([[
      { s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' },
      { s: '2026-11-04T19:00:00Z', e: '2026-11-04T19:30:00Z' },
    ], {}]);

    const next = await nextAvailableFrom(START, 30);

    expect(next).toEqual(new Date('2026-11-04T19:30:00Z'));
  });
});
