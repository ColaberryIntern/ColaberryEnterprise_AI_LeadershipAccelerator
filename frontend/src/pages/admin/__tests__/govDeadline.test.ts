import { parseDeadline, countdownTo, deadlineTone, formatCountdown, type Countdown } from '../govDeadline';

const cd = (over: Partial<Countdown>): Countdown => ({ past: false, days: 0, hours: 0, minutes: 0, ...over });
const DAY = 86_400_000; const HOUR = 3_600_000; const MIN = 60_000;

describe('parseDeadline', () => {
  it('treats a bare YYYY-MM-DD as date-only at midnight UTC (hasTime false)', () => {
    const p = parseDeadline('2026-10-22');
    expect(p).not.toBeNull();
    expect(p!.hasTime).toBe(false);
    expect(p!.ms).toBe(Date.parse('2026-10-22T00:00:00Z'));
  });
  it('treats a full ISO datetime as a real instant (hasTime true)', () => {
    const p = parseDeadline('2026-10-22T19:30:00Z');
    expect(p!.hasTime).toBe(true);
    expect(p!.ms).toBe(Date.parse('2026-10-22T19:30:00Z'));
  });
  it('returns null for empty/garbage/non-string (total, never throws)', () => {
    expect(parseDeadline(null)).toBeNull();
    expect(parseDeadline(undefined)).toBeNull();
    expect(parseDeadline('')).toBeNull();
    expect(parseDeadline('not-a-date')).toBeNull();
    expect(parseDeadline(42 as any)).toBeNull();
  });
});

describe('countdownTo', () => {
  it('splits a future gap into whole days/hours/minutes (not past)', () => {
    const now = Date.parse('2026-10-01T00:00:00Z');
    const c = countdownTo(now + 5 * DAY + 3 * HOUR + 20 * MIN, now);
    expect(c).toMatchObject({ past: false, days: 5, hours: 3, minutes: 20 });
  });
  it('flags a passed target and reports the elapsed magnitude', () => {
    const now = Date.parse('2026-10-10T00:00:00Z');
    const c = countdownTo(now - (2 * DAY + 4 * HOUR), now);
    expect(c.past).toBe(true);
    expect(c).toMatchObject({ days: 2, hours: 4 });
  });
});

describe('deadlineTone', () => {
  it('past or <=3 days -> danger, <=7 -> warning, else success', () => {
    expect(deadlineTone(cd({ past: true, days: 30 }))).toBe('danger');
    expect(deadlineTone(cd({ days: 2 }))).toBe('danger');
    expect(deadlineTone(cd({ days: 5 }))).toBe('warning');
    expect(deadlineTone(cd({ days: 10 }))).toBe('success');
  });
});

describe('formatCountdown', () => {
  it('date-only stays day-granular and never implies a cutoff time', () => {
    expect(formatCountdown(cd({ days: 5 }), false)).toBe('5 days left');
    expect(formatCountdown(cd({ days: 1 }), false)).toBe('1 day left');
    expect(formatCountdown(cd({ days: 0 }), false)).toBe('Closes today');
  });
  it('with a real time it shows hours when close, days otherwise', () => {
    expect(formatCountdown(cd({ days: 0, hours: 3, minutes: 20 }), true)).toBe('Closes in 3h 20m');
    expect(formatCountdown(cd({ days: 0, hours: 0, minutes: 20 }), true)).toBe('Closes in 20m');
    expect(formatCountdown(cd({ days: 2, hours: 5 }), true)).toBe('2d 5h left');
    expect(formatCountdown(cd({ days: 5, hours: 5 }), true)).toBe('5 days left'); // >2 days -> day-granular
  });
  it('past deadlines read as closed', () => {
    expect(formatCountdown(cd({ past: true, days: 0 }), false)).toBe('Closed today');
    expect(formatCountdown(cd({ past: true, days: 3 }), true)).toBe('Closed 3 days ago');
    expect(formatCountdown(cd({ past: true, days: 1 }), false)).toBe('Closed 1 day ago');
  });
});
