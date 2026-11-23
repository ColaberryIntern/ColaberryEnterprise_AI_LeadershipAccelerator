import { parseSessionTimeToHHMM, tzAbbrev, formatSessionTime, formatSessionTimeRange, formatCentralSessionTime, formatCentralSessionRange, sessionStartInstant } from '../sessionTime';

describe('parseSessionTimeToHHMM', () => {
  it('converts 12-hour PM to 24-hour', () => {
    expect(parseSessionTimeToHHMM('1:00 PM')).toBe('13:00');
    expect(parseSessionTimeToHHMM('11:30 PM')).toBe('23:30');
  });

  it('keeps 12 PM as 12 (noon)', () => {
    expect(parseSessionTimeToHHMM('12:00 PM')).toBe('12:00');
  });

  it('converts 12 AM to 00 (midnight)', () => {
    expect(parseSessionTimeToHHMM('12:00 AM')).toBe('00:00');
  });

  it('passes 24-hour input through and zero-pads single-digit hours', () => {
    expect(parseSessionTimeToHHMM('13:00')).toBe('13:00');
    expect(parseSessionTimeToHHMM('9:00')).toBe('09:00');
  });

  it('accepts the real stored "HH:MM:SS" shape (the missing-countdown break, 2026-07-30)', () => {
    expect(parseSessionTimeToHHMM('18:30:00')).toBe('18:30');
    expect(parseSessionTimeToHHMM('09:00:00')).toBe('09:00');
    expect(parseSessionTimeToHHMM('1:00:00 PM')).toBe('13:00');
  });

  it('returns null for empty/missing input (the original NaN-countdown break)', () => {
    expect(parseSessionTimeToHHMM('')).toBeNull();
    expect(parseSessionTimeToHHMM(null)).toBeNull();
    expect(parseSessionTimeToHHMM(undefined)).toBeNull();
  });

  it('returns null for malformed or out-of-range input', () => {
    expect(parseSessionTimeToHHMM('garbage')).toBeNull();
    expect(parseSessionTimeToHHMM('9pm')).toBeNull();
    expect(parseSessionTimeToHHMM('25:00')).toBeNull();
    expect(parseSessionTimeToHHMM('10:75')).toBeNull();
  });
});

describe('tzAbbrev', () => {
  it('returns the DST-correct label for Central time (CDT in summer, CST in winter)', () => {
    expect(tzAbbrev('America/Chicago', '2026-07-30')).toBe('CDT');
    expect(tzAbbrev('America/Chicago', '2026-01-15')).toBe('CST');
  });

  it('maps the other US zones with DST awareness', () => {
    expect(tzAbbrev('America/New_York', '2026-07-30')).toBe('EDT');
    expect(tzAbbrev('America/Denver', '2026-01-15')).toBe('MST');
    expect(tzAbbrev('America/Los_Angeles', '2026-07-30')).toBe('PDT');
  });

  it('defaults to today when no date is given', () => {
    expect(tzAbbrev('America/Chicago')).toMatch(/^C[SD]T$/);
  });

  it('returns "" for unsupported/unknown/missing zone so no misleading suffix is shown', () => {
    expect(tzAbbrev('Europe/London', '2026-07-30')).toBe('');
    expect(tzAbbrev(null)).toBe('');
    expect(tzAbbrev(undefined)).toBe('');
  });
});

describe('formatSessionTime', () => {
  it('converts 24-hour HH:MM:SS to a 12-hour clock time', () => {
    expect(formatSessionTime('18:30:00')).toBe('6:30 PM');
  });

  it('converts 24-hour HH:MM to a 12-hour clock time', () => {
    expect(formatSessionTime('09:00')).toBe('9:00 AM');
  });

  it('returns null for empty/malformed input', () => {
    expect(formatSessionTime('garbage')).toBeNull();
    expect(formatSessionTime(null)).toBeNull();
    expect(formatSessionTime(undefined)).toBeNull();
  });
});

describe('formatSessionTimeRange', () => {
  it('collapses a shared PM suffix (the reported Next-live-class case)', () => {
    expect(formatSessionTimeRange('18:30:00', '20:30:00')).toBe('6:30 - 8:30 PM');
  });

  it('collapses a shared AM suffix', () => {
    expect(formatSessionTimeRange('09:00', '11:00')).toBe('9:00 - 11:00 AM');
  });

  it('keeps both suffixes when the range crosses noon', () => {
    expect(formatSessionTimeRange('11:30:00', '13:30:00')).toBe('11:30 AM - 1:30 PM');
  });

  it('renders midnight as 12 AM and noon as 12 PM', () => {
    expect(formatSessionTimeRange('00:00:00', '01:00:00')).toBe('12:00 - 1:00 AM');
    expect(formatSessionTimeRange('12:00:00', '13:00:00')).toBe('12:00 - 1:00 PM');
  });

  it('falls back to the raw strings when either side is unparseable', () => {
    expect(formatSessionTimeRange('garbage', '20:30:00')).toBe('garbage - 20:30:00');
    expect(formatSessionTimeRange(null, undefined)).toBe('');
  });
});

/**
 * The portal Schedule list and Dashboard "Next Session" card both used to print
 * the raw stored string with a hardcoded " ET" suffix — "18:30:00 ET" for a
 * 6:30 PM Central class (reported by staff 2026-08-11). These pin the fix.
 */
describe('formatCentralSessionTime', () => {
  it('formats the stored wall-clock and labels it Central', () => {
    expect(formatCentralSessionTime('18:30:00', '2026-08-10')).toBe('6:30 PM CDT');
  });

  it('follows DST rather than hardcoding a suffix', () => {
    expect(formatCentralSessionTime('18:30:00', '2026-01-15')).toBe('6:30 PM CST');
  });

  it('never emits an Eastern label', () => {
    expect(formatCentralSessionTime('18:30:00', '2026-08-10')).not.toMatch(/E[SD]T/);
  });

  it('drops the suffix rather than guessing when the date is missing', () => {
    expect(formatCentralSessionTime('18:30:00', null)).toMatch(/^6:30 PM( C[SD]T)?$/);
  });

  it('falls back to the raw value when unparseable', () => {
    expect(formatCentralSessionTime('garbage', '2026-08-10')).toBe('garbage');
    expect(formatCentralSessionTime(null, '2026-08-10')).toBe('');
  });
});

describe('formatCentralSessionRange', () => {
  it('formats a start/end pair with one Central suffix', () => {
    expect(formatCentralSessionRange('18:30:00', '20:30:00', '2026-08-10')).toBe('6:30 - 8:30 PM CDT');
  });

  it('keeps both AM/PM suffixes across noon and still labels Central', () => {
    expect(formatCentralSessionRange('11:30:00', '13:30:00', '2026-08-10')).toBe('11:30 AM - 1:30 PM CDT');
  });

  it('never emits an Eastern label', () => {
    expect(formatCentralSessionRange('18:30:00', '20:30:00', '2026-01-15')).toBe('6:30 - 8:30 PM CST');
  });

  it('degrades to the raw strings rather than disappearing', () => {
    expect(formatCentralSessionRange('garbage', '20:30:00', '2026-08-10')).toMatch(/^garbage - 20:30:00/);
  });
});

/**
 * Every assertion here is an ABSOLUTE UTC instant, deliberately. A test that
 * compared against a locally-constructed Date would agree with the old broken
 * code on any Central-time machine - which is exactly why nobody caught this
 * for months - and would also change its mind depending on where CI ran.
 * Pinning the expected `...Z` value is what makes the viewer's zone irrelevant.
 */
describe('sessionStartInstant', () => {
  it('reads the stored digits as Central in winter (CST, UTC-6)', () => {
    expect(sessionStartInstant('2026-11-23', '18:30:00')).toBe('2026-11-24T00:30:00.000Z');
  });

  it('reads them as Central in summer (CDT, UTC-5), so DST is not a special case', () => {
    expect(sessionStartInstant('2026-07-23', '18:30:00')).toBe('2026-07-23T23:30:00.000Z');
  });

  it('accepts the 12-hour shape as well as the stored HH:MM:SS', () => {
    expect(sessionStartInstant('2026-11-23', '6:30 PM')).toBe('2026-11-24T00:30:00.000Z');
    expect(sessionStartInstant('2026-11-23', '18:30')).toBe('2026-11-24T00:30:00.000Z');
  });

  /**
   * The reported break, as arithmetic. A student on the Pacific coast opened
   * Today at 5:38 PM PST on Sunday 2026-11-22 and the card counted down
   * 1 day 0 hrs 51 min to a class that was 22 hrs 52 min away, because the
   * browser read "18:30" as 6:30 PM Pacific. Two hours too long - exactly that
   * viewer's distance from Central.
   */
  it('counts the real distance to the class, not the viewer-local one (ticket 2026-11-22)', () => {
    const target = sessionStartInstant('2026-11-23', '18:30:00') as string;
    const viewerClock = Date.parse('2026-11-23T01:38:00Z'); // 5:38 PM PST, Sun Nov 22
    const minutesAway = Math.round((Date.parse(target) - viewerClock) / 60000);
    expect(minutesAway).toBe(22 * 60 + 52);
    expect(minutesAway).not.toBe(24 * 60 + 52); // what the card actually showed
  });

  it('resolves the offset at the TARGET, not at the naive timestamp', () => {
    // Spring forward 2026-03-08: the 2am hour does not exist, and an evening
    // class that day is already on CDT.
    expect(sessionStartInstant('2026-03-08', '18:30:00')).toBe('2026-03-08T23:30:00.000Z');
    // Still CST at 1:30 AM, before the jump.
    expect(sessionStartInstant('2026-03-08', '01:30:00')).toBe('2026-03-08T07:30:00.000Z');
  });

  /**
   * These two are the ONLY cases that tell one pass from two, and without them
   * the second pass is untested code. The naive timestamp sits 5-6 hours before
   * the real instant, so the passes disagree exactly when a DST transition
   * falls inside that gap - a pre-dawn hour on changeover day. No class is
   * scheduled at 3 AM, but the helper is general, and a line that no test can
   * fail is a line nobody can safely keep.
   */
  it('re-reads the offset at the target when a DST change falls in between', () => {
    // Fall back (07:00Z): one pass would answer 08:00Z, which is 2 AM, not 3.
    expect(sessionStartInstant('2026-11-01', '03:00')).toBe('2026-11-01T09:00:00.000Z');
    // Spring forward (08:00Z): one pass would answer 11:00Z, which is 6 AM, not 5.
    expect(sessionStartInstant('2026-03-08', '05:00')).toBe('2026-03-08T10:00:00.000Z');
  });

  it('picks the earlier instant for the hour that repeats on fall-back night', () => {
    // 2026-11-01 01:30 happens twice; the CDT one (06:30Z) wins, deterministically.
    expect(sessionStartInstant('2026-11-01', '01:30:00')).toBe('2026-11-01T06:30:00.000Z');
  });

  it('handles midnight and noon without an off-by-twelve', () => {
    expect(sessionStartInstant('2026-11-23', '12:00 AM')).toBe('2026-11-23T06:00:00.000Z');
    expect(sessionStartInstant('2026-11-23', '12:00 PM')).toBe('2026-11-23T18:00:00.000Z');
  });

  it('returns null rather than an invalid date, so the caller hides the countdown', () => {
    expect(sessionStartInstant(null, '18:30:00')).toBeNull();
    expect(sessionStartInstant('2026-11-23', null)).toBeNull();
    expect(sessionStartInstant('2026-11-23', 'garbage')).toBeNull();
    expect(sessionStartInstant('23-11-2026', '18:30:00')).toBeNull();
    expect(sessionStartInstant('', '')).toBeNull();
  });
});
