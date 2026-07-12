import { parseSessionTimeToHHMM } from '../sessionTime';

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
