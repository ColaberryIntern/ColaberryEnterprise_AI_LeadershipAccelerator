import { quietUntil } from '../quietHours';

/** CH7.2 quiet hours: a Central wall-clock window; the end instant is right across daylight saving. */
const NIGHT = { start: '21:00', end: '08:00' };

describe('quietUntil', () => {
  it('outside the window, or with no window, sending may go ahead', () => {
    expect(quietUntil(new Date('2026-11-20T16:00:00Z'), NIGHT)).toBeNull(); // 10:00 AM CST
    expect(quietUntil(new Date('2026-11-20T16:00:00Z'), null)).toBeNull();
    expect(quietUntil(new Date('2026-11-20T16:00:00Z'), undefined)).toBeNull();
  });

  it('a window that crosses midnight: late evening ends tomorrow morning, early morning ends this morning', () => {
    // 10:30 PM CST Friday Nov 20 -> 8:00 AM CST Saturday Nov 21 (14:00Z).
    expect(quietUntil(new Date('2026-11-21T04:30:00Z'), NIGHT)!.toISOString()).toBe('2026-11-21T14:00:00.000Z');
    // 6:00 AM CST Saturday -> 8:00 AM CST the same day.
    expect(quietUntil(new Date('2026-11-21T12:00:00Z'), NIGHT)!.toISOString()).toBe('2026-11-21T14:00:00.000Z');
    // The edges: 9:00 PM is quiet, 8:00 AM is not.
    expect(quietUntil(new Date('2026-11-21T03:00:00Z'), NIGHT)).not.toBeNull();
    expect(quietUntil(new Date('2026-11-21T14:00:00Z'), NIGHT)).toBeNull();
  });

  it('a same-day window', () => {
    const lunch = { start: '12:00', end: '13:00' };
    expect(quietUntil(new Date('2026-11-20T18:30:00Z'), lunch)!.toISOString()).toBe('2026-11-20T19:00:00.000Z'); // 12:30 CST
    expect(quietUntil(new Date('2026-11-20T19:00:00Z'), lunch)).toBeNull();
  });

  it('across the fall-back night: quiet from 9 PM CDT Saturday Oct 31 ends at 8:00 AM CST Sunday Nov 1 (14:00Z, not 13:00Z)', () => {
    expect(quietUntil(new Date('2026-11-01T02:30:00Z'), NIGHT)!.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });

  it('across the spring-forward night: quiet from 9 PM CST Saturday Mar 13 2027 ends at 8:00 AM CDT Sunday (13:00Z)', () => {
    expect(quietUntil(new Date('2027-03-14T03:30:00Z'), NIGHT)!.toISOString()).toBe('2027-03-14T13:00:00.000Z');
  });

  it('a malformed or empty window is no window (it never silently stops all sending)', () => {
    const now = new Date('2026-11-21T04:30:00Z');
    expect(quietUntil(now, { start: '9pm', end: '08:00' })).toBeNull();
    expect(quietUntil(now, { start: '24:00', end: '08:00' })).toBeNull();
    expect(quietUntil(now, { start: '08:00', end: '08:00' })).toBeNull();
  });
});
