import { formatCentral, formatCentralDate, fromCentralInput, toCentralInput } from '../centralTime';

/**
 * Every expected value below was worked out by hand from the fixed facts: Central is UTC-5 (CDT)
 * until 2026-11-01 07:00Z and UTC-6 (CST) after; it springs forward 2026-03-08 at 08:00Z. These
 * run in whatever zone the test machine is in - which is the point: nothing may depend on it.
 */

describe('showing an instant in Central', () => {
  it('summer reads CDT, winter reads CST', () => {
    expect(formatCentral('2026-09-18T14:45:00.000Z')).toBe('Fri, Sep 18, 9:45 AM CDT');
    expect(formatCentral('2026-12-15T15:00:00.000Z')).toBe('Tue, Dec 15, 9:00 AM CST');
  });

  it('says nothing for a missing or unreadable instant, rather than "Invalid Date"', () => {
    expect(formatCentral(null)).toBeNull();
    expect(formatCentral('garbage')).toBeNull();
  });

  it('dates fall on the Central day, not the UTC day', () => {
    // 03:00Z on the 19th is still 10 PM on the 18th in Central.
    expect(formatCentralDate('2026-09-19T03:00:00.000Z')).toBe('Sep 18, 2026');
  });
});

describe('the schedule box round-trips without moving the post', () => {
  it('loads a saved instant as the Central clock reading', () => {
    // The bug this replaces put "2026-09-18T14:45" (the UTC reading) in the box.
    expect(toCentralInput('2026-09-18T14:45:00.000Z')).toBe('2026-09-18T09:45');
  });

  it('saves a typed Central time as the right instant', () => {
    expect(fromCentralInput('2026-09-18T09:45')).toBe('2026-09-18T14:45:00.000Z');
    expect(fromCentralInput('2026-12-15T09:00')).toBe('2026-12-15T15:00:00.000Z');
  });

  it('load then save returns the identical instant - the five-hour drift is gone', () => {
    for (const iso of ['2026-09-18T14:45:00.000Z', '2026-12-15T15:00:00.000Z', '2026-06-01T04:30:00.000Z']) {
      expect(fromCentralInput(toCentralInput(iso))).toBe(iso);
    }
  });

  it('refuses what is not a datetime-local value', () => {
    expect(fromCentralInput('')).toBeNull();
    expect(fromCentralInput('09/18/2026 9:45 AM')).toBeNull();
  });
});

describe('the two DST edges', () => {
  it('fall back: 1:30 AM on Nov 1 happens twice - the earlier, CDT one is chosen', () => {
    // 1:30 CDT = 06:30Z; 1:30 CST = 07:30Z. Earlier wins.
    expect(fromCentralInput('2026-11-01T01:30')).toBe('2026-11-01T06:30:00.000Z');
    expect(formatCentral('2026-11-01T06:30:00.000Z')).toBe('Sun, Nov 1, 1:30 AM CDT');
    expect(formatCentral('2026-11-01T07:30:00.000Z')).toBe('Sun, Nov 1, 1:30 AM CST');
  });

  it('just after fall back is read as CST', () => {
    expect(fromCentralInput('2026-11-01T03:00')).toBe('2026-11-01T09:00:00.000Z');
  });

  it('spring forward: 2:30 AM on Mar 8 does not exist - it moves on to 3:30 CDT', () => {
    expect(fromCentralInput('2026-03-08T02:30')).toBe('2026-03-08T08:30:00.000Z');
    expect(formatCentral('2026-03-08T08:30:00.000Z')).toBe('Sun, Mar 8, 3:30 AM CDT');
  });

  it('either side of spring forward is exact', () => {
    expect(fromCentralInput('2026-03-08T01:59')).toBe('2026-03-08T07:59:00.000Z');
    expect(fromCentralInput('2026-03-08T03:00')).toBe('2026-03-08T08:00:00.000Z');
  });
});
