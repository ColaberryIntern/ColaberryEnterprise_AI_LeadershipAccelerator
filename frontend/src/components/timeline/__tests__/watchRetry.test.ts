/**
 * watchRetry — the wait between a failed watch beat and the next attempt.
 *
 * The behaviour that matters in production is the first case below: a 429 from the participant
 * limiter carries RateLimit-Reset, and honouring it is what stops one failure turning into three
 * requests a second for the rest of the limiter's window. The rest pin the fallbacks, because the
 * header is exactly what is missing when the failure is a dropped connection rather than a 429.
 *
 * `rand` is injected throughout so these assert real numbers rather than ranges. With rand = 0.5
 * the symmetric jitter cancels to zero and the exponential curve is exact; with rand = 0 the
 * upward-only jitter on a server hint cancels too.
 */
import {
  retryDelayMs, BASE_RETRY_MS, MAX_RETRY_MS, MIN_RETRY_MS, RETRY_JITTER,
} from '../watchRetry';

const mid = () => 0.5;     // symmetric jitter -> no change
const low = () => 0;       // upward jitter -> no change; symmetric jitter -> -RETRY_JITTER

/** An axios-shaped rejection, which is what portalApi actually rejects with. */
const axiosErr = (headers: Record<string, string>) => ({ response: { headers } });

describe('a server that names its own window', () => {
  it('waits exactly as long as RateLimit-Reset asks', () => {
    // The participant limiter is 30/minute with standardHeaders, so this is the real shape.
    expect(retryDelayMs(axiosErr({ 'ratelimit-reset': '42' }), 1, low)).toBe(42_000);
  });

  it('prefers RateLimit-Reset over Retry-After when both are present', () => {
    const err = axiosErr({ 'ratelimit-reset': '12', 'retry-after': '99' });
    expect(retryDelayMs(err, 1, low)).toBe(12_000);
  });

  it('falls back to Retry-After when that is the only hint', () => {
    expect(retryDelayMs(axiosErr({ 'retry-after': '7' }), 1, low)).toBe(7_000);
  });

  it('reads a Retry-After expressed as an HTTP date', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    try {
      const thirtySecondsOn = new Date(1_700_000_000_000 + 30_000).toUTCString();
      expect(retryDelayMs(axiosErr({ 'retry-after': thirtySecondsOn }), 1, low)).toBe(30_000);
    } finally { nowSpy.mockRestore(); }
  });

  it('reads headers from a fetch Headers instance, not just an axios object', () => {
    const err = { response: { headers: new Headers({ 'RateLimit-Reset': '9' }) } };
    expect(retryDelayMs(err, 1, low)).toBe(9_000);
  });

  it('jitters a hint UPWARD only, so it never returns before the window the server named', () => {
    const err = axiosErr({ 'ratelimit-reset': '20' });
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const ms = retryDelayMs(err, 1, () => r);
      expect(ms).toBeGreaterThanOrEqual(20_000);
      expect(ms).toBeLessThanOrEqual(20_000 * (1 + RETRY_JITTER));
    }
  });

  it('does not let an absurd hint stall watch tracking indefinitely', () => {
    // A header saying "come back in three hours" would mean a lesson reports nothing at all.
    expect(retryDelayMs(axiosErr({ 'retry-after': '10800' }), 1, low)).toBe(MAX_RETRY_MS);
  });

  it('still waits a beat when the server says the window is already clear', () => {
    expect(retryDelayMs(axiosErr({ 'ratelimit-reset': '0' }), 1, low)).toBe(MIN_RETRY_MS);
  });
});

describe('no usable hint, which is every failure that is not a 429', () => {
  it('starts at the base wait', () => {
    expect(retryDelayMs(new Error('Network Error'), 1, mid)).toBe(BASE_RETRY_MS);
  });

  it('doubles while failures stay consecutive', () => {
    expect(retryDelayMs(new Error('x'), 2, mid)).toBe(BASE_RETRY_MS * 2);
    expect(retryDelayMs(new Error('x'), 3, mid)).toBe(BASE_RETRY_MS * 4);
    expect(retryDelayMs(new Error('x'), 4, mid)).toBe(BASE_RETRY_MS * 8);
  });

  it('stops doubling at the ceiling', () => {
    expect(retryDelayMs(new Error('x'), 20, mid)).toBe(MAX_RETRY_MS);
  });

  it('treats a rejection with no response at all as no hint', () => {
    // A CORS failure, an offline device, or a caller that threw a plain string.
    expect(retryDelayMs(undefined, 1, mid)).toBe(BASE_RETRY_MS);
    expect(retryDelayMs('boom', 1, mid)).toBe(BASE_RETRY_MS);
    expect(retryDelayMs({ response: {} }, 1, mid)).toBe(BASE_RETRY_MS);
  });

  it('ignores a header that does not name a number or a date', () => {
    expect(retryDelayMs(axiosErr({ 'retry-after': 'soon' }), 1, mid)).toBe(BASE_RETRY_MS);
    expect(retryDelayMs(axiosErr({ 'ratelimit-reset': '' }), 1, mid)).toBe(BASE_RETRY_MS);
  });

  it('spreads the exponential wait both ways, so players that failed together do not return together', () => {
    const lowest = retryDelayMs(new Error('x'), 1, low);
    const highest = retryDelayMs(new Error('x'), 1, () => 1);
    expect(lowest).toBe(BASE_RETRY_MS * (1 - RETRY_JITTER));
    expect(highest).toBe(BASE_RETRY_MS * (1 + RETRY_JITTER));
  });

  it('never waits less than the floor, however the attempt count arrives', () => {
    // Defensive: a caller passing 0, a negative, or junk must not produce an instant retry.
    for (const n of [0, -3, NaN]) {
      expect(retryDelayMs(new Error('x'), n as number, low)).toBeGreaterThanOrEqual(MIN_RETRY_MS);
    }
  });
});
