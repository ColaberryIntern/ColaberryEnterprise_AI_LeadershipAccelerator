import {
  parseRetryAfter,
  computeNextAttempt,
  shouldSkip,
  recordFailure,
  recordSuccess,
  getBackoffStatus,
} from '../../../services/inbox/inboxSyncBackoff';

describe('inboxSyncBackoff', () => {
  describe('parseRetryAfter', () => {
    it('extracts an ISO date following "Retry after "', () => {
      const result = parseRetryAfter('User-rate limit exceeded.  Retry after 2026-08-01T08:10:40.672Z');
      expect(result).toEqual(new Date('2026-08-01T08:10:40.672Z'));
    });

    it('returns null when no hint is present', () => {
      expect(parseRetryAfter('invalid_grant')).toBeNull();
    });

    it('returns null for undefined/null/empty input', () => {
      expect(parseRetryAfter(undefined)).toBeNull();
      expect(parseRetryAfter(null)).toBeNull();
      expect(parseRetryAfter('')).toBeNull();
    });

    it('returns null when the hint text does not parse as a date', () => {
      expect(parseRetryAfter('Retry after later')).toBeNull();
    });
  });

  describe('computeNextAttempt', () => {
    const now = new Date('2026-08-01T00:00:00.000Z');

    it('grows exponentially with consecutive failures, base 30s', () => {
      expect(computeNextAttempt(1, null, now).getTime() - now.getTime()).toBe(30_000);
      expect(computeNextAttempt(2, null, now).getTime() - now.getTime()).toBe(60_000);
      expect(computeNextAttempt(3, null, now).getTime() - now.getTime()).toBe(120_000);
    });

    it('caps exponential growth at 30 minutes', () => {
      const delay = computeNextAttempt(20, null, now).getTime() - now.getTime();
      expect(delay).toBe(30 * 60_000);
    });

    it('honors an explicit retry-after hint when it is later than the exponential value', () => {
      const hint = new Date(now.getTime() + 5 * 60_000); // 5 min out
      const result = computeNextAttempt(1, hint, now); // exponential would be 30s
      expect(result).toEqual(hint);
    });

    it('ignores a retry-after hint that is earlier than the exponential value', () => {
      const hint = new Date(now.getTime() + 1_000); // 1s out
      const result = computeNextAttempt(3, hint, now); // exponential would be 120s
      expect(result.getTime() - now.getTime()).toBe(120_000);
    });
  });

  describe('shouldSkip / recordFailure / recordSuccess', () => {
    const provider = `test-provider-${Math.random()}`;

    it('is false with no prior failures', () => {
      expect(shouldSkip(provider)).toBe(false);
    });

    it('is true immediately after a recorded failure, false after the window elapses', () => {
      const t0 = new Date('2026-08-01T00:00:00.000Z');
      recordFailure(provider, 'User-rate limit exceeded.', t0);

      expect(shouldSkip(provider, new Date(t0.getTime() + 1_000))).toBe(true);
      expect(shouldSkip(provider, new Date(t0.getTime() + 31_000))).toBe(false);
    });

    it('clears the backoff on recordSuccess', () => {
      const t0 = new Date('2026-08-01T00:00:00.000Z');
      recordFailure(provider, 'User-rate limit exceeded.', t0);
      expect(shouldSkip(provider, new Date(t0.getTime() + 1_000))).toBe(true);

      recordSuccess(provider);
      expect(shouldSkip(provider, new Date(t0.getTime() + 1_000))).toBe(false);
      expect(getBackoffStatus(provider)).toEqual({ consecutiveFailures: 0, nextAttemptAt: null });
    });

    it('does not affect a different provider\'s backoff state (isolation)', () => {
      const providerA = `${provider}-a`;
      const providerB = `${provider}-b`;
      const t0 = new Date('2026-08-01T00:00:00.000Z');

      recordFailure(providerA, 'User-rate limit exceeded.', t0);

      expect(shouldSkip(providerA, new Date(t0.getTime() + 1_000))).toBe(true);
      expect(shouldSkip(providerB, new Date(t0.getTime() + 1_000))).toBe(false);
    });
  });
});
