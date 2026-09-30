import { classInstant, isSessionUpcoming, isSessionDueLive, isSessionDueCompleted } from '../acceleratorService';

// Regression coverage for the check-in-blocking bug found live 2026-07-23
// (Session CC-20260723-t7n4): the session-lifecycle cron built Date objects
// from Central wall-clock strings with no timezone, so a UTC container read
// "18:30" as 18:30 UTC (= 1:30pm Central) instead of 6:30pm Central — auto-
// completing sessions hours before the real class, which blocked check-in.

describe('classInstant', () => {
  it('reads a summer (CDT, UTC-5) Central wall-clock as the correct UTC instant', () => {
    // Tonight's real Orientation: 2026-07-23, 18:30 Central start.
    expect(classInstant('2026-07-23', '18:30').toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('reads a winter (CST, UTC-6) Central wall-clock as the correct UTC instant', () => {
    expect(classInstant('2026-01-15', '18:30').toISOString()).toBe('2026-01-16T00:30:00.000Z');
  });
});

describe('isSessionDueLive (the exact reported bug)', () => {
  const session = { session_date: '2026-07-23', start_time: '6:30 PM' };

  it('is NOT due live hours before the real 6:30pm CT start (the old naive-UTC bug would have said yes by ~5:15pm UTC)', () => {
    const now = new Date('2026-07-23T17:08:00Z'); // the exact failed check-in timestamp
    expect(isSessionDueLive(session, now)).toBe(false);
  });

  it('is not due live even right at the naive (wrong) UTC threshold', () => {
    const now = new Date('2026-07-23T18:20:00Z'); // 15 min before a naive-UTC reading of 18:30
    expect(isSessionDueLive(session, now)).toBe(false);
  });

  it('becomes due live 15 minutes before the true Central-time start (23:15Z)', () => {
    expect(isSessionDueLive(session, new Date('2026-07-23T23:14:00Z'))).toBe(false);
    expect(isSessionDueLive(session, new Date('2026-07-23T23:16:00Z'))).toBe(true);
  });

  it('stops being due live well after the class should have started (stale scheduled session)', () => {
    const now = new Date('2026-07-24T06:00:00Z'); // ~6.5h after the true 23:30Z start
    expect(isSessionDueLive(session, now)).toBe(false);
  });
});

describe('isSessionDueCompleted', () => {
  const session = { session_date: '2026-07-23', end_time: '8:30 PM' }; // 20:30 CT = 01:30Z next day

  it('is not due completed before 30 minutes past the true Central-time end', () => {
    expect(isSessionDueCompleted(session, new Date('2026-07-24T01:59:00Z'))).toBe(false);
  });

  it('is due completed 30 minutes past the true Central-time end', () => {
    expect(isSessionDueCompleted(session, new Date('2026-07-24T02:00:00Z'))).toBe(true);
  });
});

describe('isSessionUpcoming', () => {
  const session = { session_date: '2026-07-23', start_time: '6:30 PM' };

  it('is not upcoming when the reminder window naively-computed in UTC would have wrongly matched', () => {
    const now = new Date('2026-07-23T17:00:00Z');
    const cutoff = new Date('2026-07-23T18:00:00Z'); // 1h ahead, naive-UTC math would wrongly include 18:30
    expect(isSessionUpcoming(session, now, cutoff)).toBe(false);
  });

  it('is upcoming once the true Central-time start falls inside the window', () => {
    const now = new Date('2026-07-23T22:45:00Z');
    const cutoff = new Date('2026-07-23T23:45:00Z'); // true start 23:30Z falls inside
    expect(isSessionUpcoming(session, now, cutoff)).toBe(true);
  });
});
