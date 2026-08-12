import { parseSessionTimeToHHMM, tzAbbrev, formatSessionTime, formatSessionTimeRange, formatCentralSessionTime, formatCentralSessionRange } from '../sessionTime';

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
