/**
 * Tests for the Basecamp 429/503 backoff helper that keeps OpsBcSync from
 * dropping todolists when Basecamp rate-limits the sync burst.
 */
import { bcBackoffMs, BC_RETRYABLE_STATUS, paceDelayMs } from '../bcRetry';

describe('BC_RETRYABLE_STATUS', () => {
  it('retries 429 and 503 only', () => {
    expect(BC_RETRYABLE_STATUS.has(429)).toBe(true);
    expect(BC_RETRYABLE_STATUS.has(503)).toBe(true);
    expect(BC_RETRYABLE_STATUS.has(200)).toBe(false);
    expect(BC_RETRYABLE_STATUS.has(401)).toBe(false);
    expect(BC_RETRYABLE_STATUS.has(500)).toBe(false);
  });
});

describe('bcBackoffMs', () => {
  it('honors a sane Retry-After header (seconds -> ms)', () => {
    expect(bcBackoffMs('1', 0)).toBe(1000);
    expect(bcBackoffMs('5', 3)).toBe(5000); // header wins over the attempt-based curve
  });

  it('caps a huge Retry-After at 30s', () => {
    expect(bcBackoffMs('120', 0)).toBe(30000);
  });

  it('falls back to capped exponential backoff when Retry-After is missing/invalid', () => {
    expect(bcBackoffMs(null, 0)).toBe(1000);
    expect(bcBackoffMs(null, 1)).toBe(2000);
    expect(bcBackoffMs(null, 2)).toBe(4000);
    expect(bcBackoffMs(null, 3)).toBe(8000);
    expect(bcBackoffMs(null, 9)).toBe(8000); // capped at 8s
    expect(bcBackoffMs('abc', 0)).toBe(1000);
    expect(bcBackoffMs('0', 1)).toBe(2000); // 0 is not a usable delay -> exponential
    expect(bcBackoffMs('-3', 0)).toBe(1000);
  });
});

describe('paceDelayMs', () => {
  it('returns the remaining interval since the last call', () => {
    expect(paceDelayMs(1000, 1000, 250)).toBe(250);
    expect(paceDelayMs(1000, 1100, 250)).toBe(150);
  });

  it('returns 0 once the interval has elapsed (or on a cold start)', () => {
    expect(paceDelayMs(1000, 1250, 250)).toBe(0);
    expect(paceDelayMs(1000, 9999, 250)).toBe(0);
    expect(paceDelayMs(0, Date.now(), 250)).toBe(0); // first-ever call never waits
  });
});
