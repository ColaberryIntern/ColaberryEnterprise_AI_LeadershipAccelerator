import { expandOccurrences, upcomingOccurrences, MAX_OCCURRENCES } from '../eventRecurrence';
import { EventInput, EventInputError, toEventFields } from '../eventInput';

/**
 * CH2.2 time rules. Central DST in this window: CDT ends Sun 2026-11-01, CST ends Sun 2027-03-14.
 * 6:00 PM CDT = 23:00Z; 6:00 PM CST = 00:00Z next day.
 */
const parse = (o: Record<string, unknown>) => EventInput.parse({ title: 'Demo Tuesday', date: '2026-10-27', start_time: '18:00', ...o });

describe('CH2.2 Central input becomes the right instant', () => {
  it('summer and winter dates convert with the offset in force on that date', () => {
    expect(toEventFields(parse({ date: '2026-07-14' })).starts_at.toISOString()).toBe('2026-07-14T23:00:00.000Z');
    expect(toEventFields(parse({ date: '2026-11-24' })).starts_at.toISOString()).toBe('2026-11-25T00:00:00.000Z');
  });

  it('an end time on the same day becomes ends_at; end before start is refused', () => {
    expect(toEventFields(parse({ end_time: '19:30' })).ends_at!.toISOString()).toBe('2026-10-28T00:30:00.000Z');
    expect(() => toEventFields(parse({ end_time: '17:00' }))).toThrow(EventInputError);
    expect(() => toEventFields(parse({ end_time: '18:00' }))).toThrow(/after the start/);
  });

  it('a repeat that ends before it starts, or runs past a year, is refused', () => {
    expect(() => toEventFields(parse({ repeat: { freq: 'weekly', until: '2026-10-01' } }))).toThrow(/on or after/);
    expect(() => toEventFields(parse({ repeat: { freq: 'weekly', until: '2027-12-01' } }))).toThrow(/at most one year/);
  });

  it('the schema refuses bad shapes before any service runs', () => {
    expect(EventInput.safeParse({ title: 'x', date: '10/27/2026', start_time: '18:00' }).success).toBe(false);
    expect(EventInput.safeParse({ title: 'x', date: '2026-10-27', start_time: '6:00 PM' }).success).toBe(false);
    expect(EventInput.safeParse({ title: '', date: '2026-10-27', start_time: '18:00' }).success).toBe(false);
    expect(EventInput.safeParse({ title: 'x', date: '2026-10-27', start_time: '18:00', surprise: 1 }).success).toBe(false);
    expect(EventInput.safeParse({ title: 'x', date: '2026-10-27', start_time: '18:00', join_url: 'not a url' }).success).toBe(false);
    expect(EventInput.safeParse({ title: 'x', date: '2026-10-27', start_time: '18:00', audience: { kind: 'cohorts', cohort_ids: [] } }).success).toBe(false);
  });

  it('defaults: all members, every placement on, scheduled', () => {
    const f = toEventFields(parse({}));
    expect(f.audience).toEqual({ kind: 'all_members' });
    expect(f.placement).toEqual({ calendar: true, events_page: true, campus_rail: true });
    expect(f.status).toBe('scheduled');
  });
});

describe('CH2.2 recurrence keeps the Central wall clock across DST', () => {
  const start = new Date('2026-10-27T23:00:00Z'); // Tue 6:00 PM CDT
  const end = new Date('2026-10-28T00:00:00Z');   // one hour

  it('weekly across the November change stays at 6:00 PM Central', () => {
    const occ = expandOccurrences(start, end, { freq: 'weekly', until: '2026-11-10' });
    expect(occ.map((o) => o.starts_at.toISOString())).toEqual([
      '2026-10-27T23:00:00.000Z', // CDT
      '2026-11-04T00:00:00.000Z', // Tue Nov 3, 6:00 PM CST
      '2026-11-11T00:00:00.000Z',
    ]);
    expect(occ.every((o) => o.ends_at!.getTime() - o.starts_at.getTime() === 3_600_000)).toBe(true);
  });

  it('biweekly across the March change moves back to 23:00Z', () => {
    const occ = expandOccurrences(new Date('2027-03-03T00:00:00Z'), null, { freq: 'biweekly', until: '2027-03-17' });
    expect(occ.map((o) => o.starts_at.toISOString())).toEqual(['2027-03-03T00:00:00.000Z', '2027-03-16T23:00:00.000Z']);
  });

  it('monthly skips a month that has no such day', () => {
    const occ = expandOccurrences(new Date('2027-01-31T18:00:00Z'), null, { freq: 'monthly', until: '2027-05-31' });
    expect(occ.map((o) => o.starts_at.toISOString().slice(0, 10))).toEqual(['2027-01-31', '2027-03-31', '2027-05-31']);
  });

  it('no repeat is exactly one occurrence; the count is capped', () => {
    expect(expandOccurrences(start, null, null)).toHaveLength(1);
    expect(expandOccurrences(start, null, { freq: 'weekly', until: '2027-10-27' }).length).toBeLessThanOrEqual(MAX_OCCURRENCES);
  });

  it('upcoming drops the past', () => {
    const up = upcomingOccurrences(start, end, { freq: 'weekly', until: '2026-11-10' }, new Date('2026-11-05T00:00:00Z'));
    expect(up.map((o) => o.starts_at.toISOString())).toEqual(['2026-11-11T00:00:00.000Z']);
  });
});
