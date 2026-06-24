/**
 * Unit tests for the scheduled-action staleness policy (CC-20260623-q8m4).
 *
 * Guards the production defect found 2026-06-23: 730 March-May "zombie"
 * scheduled_emails sat pending+past-due forever because the per-lead daily cap
 * re-deferred them to "tomorrow" every day. With no staleness guard they never
 * drained, and the send_throughput health check stayed permanently red. These
 * functions decide which actions are too old to ever fire.
 */
import {
  DEFAULT_MAX_AGE_DAYS,
  staleCutoff,
  isExpiredScheduledAction,
  resolveMaxAgeDays,
} from '../scheduledActionPolicy';

const NOW = new Date('2026-06-23T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('staleCutoff', () => {
  it('is maxAgeDays before now', () => {
    expect(staleCutoff(NOW, 14).toISOString()).toBe('2026-06-09T12:00:00.000Z');
  });
  it('defaults to DEFAULT_MAX_AGE_DAYS', () => {
    expect(staleCutoff(NOW).getTime()).toBe(staleCutoff(NOW, DEFAULT_MAX_AGE_DAYS).getTime());
  });
});

describe('isExpiredScheduledAction', () => {
  it('expires the real March-May zombie backlog (26+ days old)', () => {
    expect(isExpiredScheduledAction(new Date('2026-05-28T00:00:00Z'), NOW, 14)).toBe(true);
    expect(isExpiredScheduledAction(new Date('2026-03-23T00:00:00Z'), NOW, 14)).toBe(true);
  });
  it('does NOT expire a recently-deferred (still timely) action', () => {
    expect(isExpiredScheduledAction(daysAgo(3), NOW, 14)).toBe(false);
    expect(isExpiredScheduledAction(daysAgo(13), NOW, 14)).toBe(false);
  });
  it('does NOT expire a future-scheduled action', () => {
    expect(isExpiredScheduledAction(new Date(NOW.getTime() + 86400000), NOW, 14)).toBe(false);
  });
  it('is exclusive at exactly the cutoff (cutoff itself is not expired)', () => {
    expect(isExpiredScheduledAction(staleCutoff(NOW, 14), NOW, 14)).toBe(false);
    expect(isExpiredScheduledAction(new Date(staleCutoff(NOW, 14).getTime() - 1), NOW, 14)).toBe(true);
  });
  it('accepts ISO strings as well as Dates', () => {
    expect(isExpiredScheduledAction('2026-05-28T00:00:00Z', NOW, 14)).toBe(true);
  });
  it('treats null / invalid dates as not-expired (never cancels on bad data)', () => {
    expect(isExpiredScheduledAction(null, NOW, 14)).toBe(false);
    expect(isExpiredScheduledAction(undefined, NOW, 14)).toBe(false);
    expect(isExpiredScheduledAction('not-a-date', NOW, 14)).toBe(false);
  });
});

describe('resolveMaxAgeDays', () => {
  it('uses the configured value when numeric', () => {
    expect(resolveMaxAgeDays('30')).toBe(30);
  });
  it('falls back to the default when missing / non-numeric', () => {
    expect(resolveMaxAgeDays(null)).toBe(DEFAULT_MAX_AGE_DAYS);
    expect(resolveMaxAgeDays('')).toBe(DEFAULT_MAX_AGE_DAYS);
    expect(resolveMaxAgeDays('abc')).toBe(DEFAULT_MAX_AGE_DAYS);
  });
  it('allows 0 / negative to disable expiry (caller treats <=0 as off)', () => {
    expect(resolveMaxAgeDays('0')).toBe(0);
    expect(resolveMaxAgeDays('-5')).toBe(-5);
  });
});
