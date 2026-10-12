/**
 * classInstant is the function that decides when a class actually happens, and it had no
 * test of its own. Its three siblings (formatCentralClock, formatCentralDateTime,
 * sessionDayLabel) are covered; the scheduling math underneath them was not.
 *
 * That matters because this is the exact logic whose absence caused a production incident:
 * live_sessions stores Central wall-clock TEXT with no timezone, a naive
 * `new Date(date + "T" + time)` in a UTC container reads it AS UTC, and on 2026-07-23 an
 * Orientation was auto-marked 'completed' hours before its real 6:30pm CT start, blocking
 * check-in. The fix landed; the regression test did not.
 *
 * Pure — no models, no DB — so this runs in CI, unlike the communityCalendarService suite
 * that exercises this same path (excluded from jest.ci.config.ts because it instantiates
 * Sequelize models and needs a live database).
 */
import { classInstant, convertTo24h } from '../centralDate';

describe('classInstant — Central wall-clock to a true instant', () => {
  it('reads an evening class as Central, not as UTC', () => {
    // 2026-07-23 is CDT (UTC-5): 6:30 PM Central is 23:30Z.
    expect(classInstant('2026-07-23', '18:30').toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('is NOT the naive parse — the five-hour error must be impossible', () => {
    // If these ever match, the Central conversion has been removed and the 2026-07-23
    // incident is back.
    const correct = classInstant('2026-07-23', '18:30').toISOString();
    expect(correct).not.toBe('2026-07-23T18:30:00.000Z');
  });

  it('follows DST rather than assuming one offset all year', () => {
    // CST (UTC-6) in January: 18:30 Central crosses midnight UTC.
    expect(classInstant('2026-01-14', '18:30').toISOString()).toBe('2026-01-15T00:30:00.000Z');
    // CDT (UTC-5) in July.
    expect(classInstant('2026-07-14', '18:30').toISOString()).toBe('2026-07-14T23:30:00.000Z');
  });

  it('handles the spring-forward and fall-back weekends', () => {
    // 2026 US DST: forward Sun Mar 8, back Sun Nov 1.
    expect(classInstant('2026-03-07', '18:30').toISOString()).toBe('2026-03-08T00:30:00.000Z'); // CST
    expect(classInstant('2026-03-09', '18:30').toISOString()).toBe('2026-03-09T23:30:00.000Z'); // CDT
    expect(classInstant('2026-10-31', '18:30').toISOString()).toBe('2026-10-31T23:30:00.000Z'); // CDT
    expect(classInstant('2026-11-02', '18:30').toISOString()).toBe('2026-11-03T00:30:00.000Z'); // CST
  });

  it('accepts a 12-hour meridiem time', () => {
    expect(classInstant('2026-07-23', '6:30 PM').toISOString()).toBe('2026-07-23T23:30:00.000Z');
    expect(classInstant('2026-07-23', '9:00 AM').toISOString()).toBe('2026-07-23T14:00:00.000Z');
  });

  it('accepts the trailing seconds a Sequelize TIME column returns', () => {
    // The optional seconds group is load-bearing: without it every "HH:MM:SS" value fell
    // through to the 10:00 default and the lifecycle cron judged classes against a fake
    // 10am Central. centralDate's header says do not "tidy" it — this proves why.
    expect(classInstant('2026-07-23', '18:30:00').toISOString()).toBe('2026-07-23T23:30:00.000Z');
    expect(classInstant('2026-07-23', '18:30:45').toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('handles midnight and noon without a 12-hour wrap bug', () => {
    expect(classInstant('2026-07-23', '12:00 AM').toISOString()).toBe('2026-07-23T05:00:00.000Z');
    expect(classInstant('2026-07-23', '12:00 PM').toISOString()).toBe('2026-07-23T17:00:00.000Z');
  });

  it('falls back to 10:00 for an unparseable time — documented, not accidental', () => {
    // The fallback is deliberate (scheduling math needs SOME instant) but it is a known
    // sharp edge: it is why broadcastIdentity.deriveStartInstant reports derived:false
    // instead of passing this value along silently.
    expect(convertTo24h('not a time')).toBe('10:00');
    expect(classInstant('2026-07-23', 'not a time').toISOString()).toBe('2026-07-23T15:00:00.000Z');
  });
});
