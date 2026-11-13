/**
 * The open-slot rules (kit §4.2, §5): blocks, notice, max per week and existing bookings, in the
 * candidate's zone, across both DST changes. Pure: no mocks.
 */
import { BLOCK_KEYS, isTimeZone, localDate, openSlots, wallToUtc, weekOf } from '../hireSlots';

const CT = 'America/Chicago';
const rules = (o: Partial<Parameters<typeof openSlots>[0]> = {}) =>
  ({ tz: CT, blocks: ['Mon-morning'], maxPerWeek: null, minNoticeHours: 0, ...o });
const iso = (ds: Date[]) => ds.map((d) => d.toISOString());
// Thu 12 Nov 2026, 10:00 CT: well before the windows below.
const NOW = new Date('2026-11-12T16:00:00Z');

describe('wallToUtc / localDate - per-date offsets', () => {
  it('maps Central wall time to UTC on both sides of the November change (CDT -5, CST -6)', () => {
    expect(wallToUtc(2026, 10, 26, 9, 0, CT).toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(wallToUtc(2026, 11, 2, 9, 0, CT).toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });

  it('maps across the March change too, and in another zone', () => {
    expect(wallToUtc(2027, 3, 5, 9, 0, CT).toISOString()).toBe('2027-03-05T15:00:00.000Z');
    expect(wallToUtc(2027, 3, 15, 9, 0, CT).toISOString()).toBe('2027-03-15T14:00:00.000Z');
    expect(wallToUtc(2026, 11, 16, 9, 0, 'Asia/Kolkata').toISOString()).toBe('2026-11-16T03:30:00.000Z');
  });

  it('reads the calendar date and the Monday of the week in the given zone', () => {
    // 03:00Z Tue is still Monday evening in Central.
    expect(localDate(new Date('2026-11-17T03:00:00Z'), CT)).toBe('2026-11-16');
    expect(weekOf(new Date('2026-11-22T20:00:00Z'), CT)).toBe('2026-11-16'); // Sunday belongs to Mon 16
    expect(weekOf(new Date('2026-11-23T15:00:00Z'), CT)).toBe('2026-11-23');
  });

  it('accepts IANA zones only', () => {
    expect(isTimeZone(CT)).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});

describe('openSlots', () => {
  it('fills an open block on the half hour, ending inside it', () => {
    const s = iso(openSlots(rules(), { minutes: 60, fromDate: '2026-11-16', now: NOW, held: [], days: 1 }));
    // Morning is 9-12 CST = 15:00-18:00Z; a 60-minute slot can start up to 11:00.
    expect(s).toEqual(['2026-11-16T15:00:00.000Z', '2026-11-16T15:30:00.000Z', '2026-11-16T16:00:00.000Z',
      '2026-11-16T16:30:00.000Z', '2026-11-16T17:00:00.000Z']);
  });

  it('only opens the blocks the candidate marked, and never a weekend', () => {
    const s = openSlots(rules({ blocks: ['Tue-evening'] }), { minutes: 20, fromDate: '2026-11-16', now: NOW, held: [], days: 7 });
    expect(new Set(s.map((d) => localDate(d, CT)))).toEqual(new Set(['2026-11-17']));
    expect(openSlots(rules({ blocks: [] }), { minutes: 20, fromDate: '2026-11-16', now: NOW, held: [] })).toEqual([]);
    expect(openSlots(rules({ blocks: ['Sat-morning'] }), { minutes: 20, fromDate: '2026-11-16', now: NOW, held: [] })).toEqual([]);
    expect(BLOCK_KEYS).toHaveLength(15);
  });

  it('drops anything sooner than the minimum notice', () => {
    const now = new Date('2026-11-15T16:00:00Z'); // Sun 10:00 CT
    const s = openSlots(rules({ minNoticeHours: 24 }), { minutes: 60, fromDate: '2026-11-16', now, held: [], days: 1 });
    expect(iso(s)).toEqual(['2026-11-16T16:00:00.000Z', '2026-11-16T16:30:00.000Z', '2026-11-16T17:00:00.000Z']);
  });

  it('drops every slot that overlaps a time already held', () => {
    const held = [{ startsAt: new Date('2026-11-16T16:00:00Z'), minutes: 45 }]; // 10:00-10:45 CT
    const s = iso(openSlots(rules(), { minutes: 30, fromDate: '2026-11-16', now: NOW, held, days: 1 }));
    // 9:30-10:00 ends exactly as the held one starts, so it stays; 10:00 and 10:30 overlap it.
    expect(s).toEqual(['2026-11-16T15:00:00.000Z', '2026-11-16T15:30:00.000Z', '2026-11-16T17:00:00.000Z', '2026-11-16T17:30:00.000Z']);
  });

  it('closes a whole week once it holds max_per_week interviews, and leaves the next week open', () => {
    const held = [{ startsAt: new Date('2026-11-18T20:00:00Z'), minutes: 20 }, { startsAt: new Date('2026-11-19T20:00:00Z'), minutes: 20 }];
    const s = openSlots(rules({ maxPerWeek: 2 }), { minutes: 60, fromDate: '2026-11-16', now: NOW, held });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((d) => weekOf(d, CT) !== '2026-11-16')).toBe(true);
    expect(s.some((d) => weekOf(d, CT) === '2026-11-23')).toBe(true);
  });

  it('keeps 9:00 AM Central at 9:00 AM through the week the clocks change', () => {
    const s = openSlots(rules({ blocks: ['Fri-morning', 'Mon-morning'] }), {
      minutes: 180, fromDate: '2026-10-30', now: new Date('2026-10-01T00:00:00Z'), held: [], days: 4,
    });
    expect(iso(s)).toEqual(['2026-10-30T14:00:00.000Z', '2026-11-02T15:00:00.000Z']);
  });

  it('is deterministic: the same inputs give the same slots', () => {
    const q = { minutes: 45, fromDate: '2026-11-16', now: NOW, held: [] };
    expect(iso(openSlots(rules({ blocks: ['Wed-afternoon'] }), q))).toEqual(iso(openSlots(rules({ blocks: ['Wed-afternoon'] }), q)));
  });
});
