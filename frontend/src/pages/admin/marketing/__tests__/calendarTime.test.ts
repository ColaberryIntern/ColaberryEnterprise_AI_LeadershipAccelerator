import { brandLocal, groupByDay, isValidTimeZone, type CalendarItem } from '../calendarTime';

/**
 * An item scheduled across a US DST boundary renders at the correct brand-local time.
 *
 * US DST ends 2026-11-01 at 02:00 local, when America/Chicago goes from CDT (-05:00) back to
 * CST (-06:00). The cases below straddle that instant on purpose. The one that matters most
 * is the repeated hour: 01:30 happens TWICE that morning, and a calendar that renders both as
 * "1:30 AM" with no offset has shown two different instants identically.
 */

const CHICAGO = 'America/Chicago';

describe('brand-local rendering across the fall-back boundary', () => {
  it('a 9 AM post the day BEFORE the change is CDT', () => {
    // 2026-10-31 14:00Z is 09:00 CDT.
    const r = brandLocal('2026-10-31T14:00:00Z', CHICAGO)!;
    expect(r.day).toBe('2026-10-31');
    expect(r.time).toBe('9:00 AM');
    expect(r.zone).toBe('CDT');
    expect(r.offset).toBe('-05:00');
  });

  it('a 9 AM post the day AFTER the change is CST - same wall clock, different instant', () => {
    // 2026-11-02 15:00Z is 09:00 CST. One UTC hour later than the CDT case for the same
    // wall-clock time, which is exactly what a naive "add a day" computation gets wrong.
    const r = brandLocal('2026-11-02T15:00:00Z', CHICAGO)!;
    expect(r.day).toBe('2026-11-02');
    expect(r.time).toBe('9:00 AM');
    expect(r.zone).toBe('CST');
    expect(r.offset).toBe('-06:00');
  });

  it('the REPEATED 1:30 AM is rendered as two distinguishable instants', () => {
    const first = brandLocal('2026-11-01T06:30:00Z', CHICAGO)!;  // 01:30 CDT
    const second = brandLocal('2026-11-01T07:30:00Z', CHICAGO)!; // 01:30 CST, an hour later
    expect(first.time).toBe('1:30 AM');
    expect(second.time).toBe('1:30 AM');
    // Identical wall clock - and the offset is what tells them apart.
    expect(first.offset).toBe('-05:00');
    expect(second.offset).toBe('-06:00');
    expect(first.zone).toBe('CDT');
    expect(second.zone).toBe('CST');
  });

  it('an instant just before the change and one just after are both on 2026-11-01', () => {
    // The day does not change at the DST instant; only the offset does.
    expect(brandLocal('2026-11-01T06:59:00Z', CHICAGO)!.day).toBe('2026-11-01');
    expect(brandLocal('2026-11-01T07:01:00Z', CHICAGO)!.day).toBe('2026-11-01');
  });

  it('spring-forward: the skipped hour never appears', () => {
    // 2026-03-08 02:00 CST does not exist; clocks go 01:59 CST -> 03:00 CDT. 08:00Z is 03:00 CDT.
    const r = brandLocal('2026-03-08T08:00:00Z', CHICAGO)!;
    expect(r.time).toBe('3:00 AM');
    expect(r.zone).toBe('CDT');
    // And a minute before is still 01:59 CST - nothing renders as 2:xx.
    expect(brandLocal('2026-03-08T07:59:00Z', CHICAGO)!.time).toBe('1:59 AM');
  });
});

describe('the day boundary is the BRAND\'s, not the browser\'s', () => {
  it('a late-evening Chicago post is the same calendar day in Chicago and the next in London', () => {
    // 2026-10-15 04:30Z: 23:30 CDT on Oct 14 in Chicago; 05:30 BST on Oct 15 in London.
    const iso = '2026-10-15T04:30:00Z';
    expect(brandLocal(iso, CHICAGO)!.day).toBe('2026-10-14');
    expect(brandLocal(iso, 'Europe/London')!.day).toBe('2026-10-15');
  });

  it('defaults to America/Chicago when no zone is given', () => {
    expect(brandLocal('2026-10-31T14:00:00Z')!.zone).toBe('CDT');
  });

  it('returns null for an unparseable instant rather than rendering "Invalid Date"', () => {
    expect(brandLocal('soon', CHICAGO)).toBeNull();
  });
});

describe('timezone validation at the write boundary', () => {
  it('accepts IANA names', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects abbreviations and typos', () => {
    // "CST" is ambiguous - Central Standard or China Standard - and must not be storable.
    expect(isValidTimeZone('CST')).toBe(false);
    expect(isValidTimeZone('America/Chicagoo')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('cross-brand grouping', () => {
  const item = (id: string, scheduledFor: string, brandTimeZone: string | null): CalendarItem => ({
    id, brandId: 'b', brandName: 'B', brandTimeZone, channel: 'linkedin', title: id, scheduledFor, status: 'scheduled',
  });

  it('lays the grid out in the VIEWER zone and carries brand-local time on each item', () => {
    const items = [
      item('chicago-late', '2026-10-15T04:30:00Z', 'America/Chicago'), // 23:30 Oct 14 Chicago
      item('london-early', '2026-10-15T04:30:00Z', 'Europe/London'),  // 05:30 Oct 15 London
    ];
    // Viewed from London: both land on Oct 15 - same instant, one column.
    const london = groupByDay(items, 'Europe/London');
    expect(london.map((d) => d.day)).toEqual(['2026-10-15']);
    expect(london[0].items).toHaveLength(2);
    // But each item still says what time it goes out WHERE THE AUDIENCE IS.
    expect(london[0].items.find((i) => i.id === 'chicago-late')!.local.time).toBe('11:30 PM');
    expect(london[0].items.find((i) => i.id === 'chicago-late')!.local.day).toBe('2026-10-14');
    // Viewed from Chicago: Oct 14.
    expect(groupByDay(items, 'America/Chicago').map((d) => d.day)).toEqual(['2026-10-14']);
  });

  it('orders items within a day by instant, not by insertion', () => {
    const items = [item('later', '2026-10-20T16:00:00Z', null), item('earlier', '2026-10-20T14:00:00Z', null)];
    expect(groupByDay(items, 'UTC')[0].items.map((i) => i.id)).toEqual(['earlier', 'later']);
  });

  it('files an unparseable schedule under "invalid" rather than dropping it', () => {
    // Dropping would hide a broken item; a visible "invalid" bucket says something is wrong.
    const days = groupByDay([item('broken', 'soon', null)], 'UTC');
    expect(days.map((d) => d.day)).toEqual(['invalid']);
    expect(days[0].items[0].local.dayLabel).toBe('Invalid time');
  });

  it('does not mutate the input', () => {
    const items = [item('b', '2026-10-20T16:00:00Z', null), item('a', '2026-10-20T14:00:00Z', null)];
    groupByDay(items, 'UTC');
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
