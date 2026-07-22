import { parseSessionTimeToHHMM, tzAbbrev } from '../sessionTime';

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
  it('maps the Central program zone to CT (fixes the hardcoded-ET mislabel)', () => {
    expect(tzAbbrev('America/Chicago')).toBe('CT');
  });

  it('maps the other US zones', () => {
    expect(tzAbbrev('America/New_York')).toBe('ET');
    expect(tzAbbrev('America/Denver')).toBe('MT');
    expect(tzAbbrev('America/Los_Angeles')).toBe('PT');
  });

  it('returns "" for unknown/missing zone so no misleading suffix is shown', () => {
    expect(tzAbbrev('Europe/London')).toBe('');
    expect(tzAbbrev(null)).toBe('');
    expect(tzAbbrev(undefined)).toBe('');
  });
});
