import {
  clampPollMs,
  backoffMs,
  CLIENT_MIN_POLL_MS,
  CLIENT_MAX_POLL_MS,
  CLIENT_DEFAULT_POLL_MS,
  BACKOFF_CAP_MS,
} from '../useBroadcastDiscovery';

/**
 * The bounds on the discovery poll — the part of P3-09 that has to be a test rather than a
 * paragraph.
 *
 * The cadence is chosen by the SERVER so it can be slowed by an env change during an incident
 * instead of a frontend deploy. That makes the response a second input the client must not
 * trust blindly: a stale cache, a misconfigured environment or a typo must not be able to
 * turn every signed-in viewer into a one-second poller. So the clamp exists on both sides,
 * and these are the client's half.
 *
 * The hook's behavioural half — hidden tabs not polling, backoff on failure, the last known
 * list surviving an outage — is exercised through the badge in
 * `components/portal/__tests__/liveNowBadge.test.tsx`, where there is a renderer to drive it.
 */

describe('the client does not trust the cadence it is handed', () => {
  it('uses the server value when it is sane', () => {
    expect(clampPollMs(45_000)).toBe(45_000);
    expect(clampPollMs(60_000)).toBe(60_000);
  });

  it('refuses a cadence below the floor', () => {
    // The failure this prevents: one bad env value turning every open tab into a load test.
    expect(clampPollMs(1_000)).toBe(CLIENT_MIN_POLL_MS);
    expect(clampPollMs(0)).toBe(CLIENT_MIN_POLL_MS);
    expect(clampPollMs(-5_000)).toBe(CLIENT_MIN_POLL_MS);
  });

  it('refuses a cadence above the ceiling, because a stale badge is a lie', () => {
    expect(clampPollMs(3_600_000)).toBe(CLIENT_MAX_POLL_MS);
  });

  it('falls back to the default for anything that is not a finite number', () => {
    // parseInt-style garbage survives Math.min/max as NaN, so this is an explicit guard
    // rather than something the clamp happens to catch.
    for (const bad of [undefined, null, '45000', NaN, Infinity, {}, [], 'soon']) {
      expect(clampPollMs(bad)).toBe(CLIENT_DEFAULT_POLL_MS);
    }
  });
});

describe('a failing endpoint backs off and never spins', () => {
  it('doubles from the current cadence', () => {
    expect(backoffMs(1, 45_000)).toBe(45_000);
    expect(backoffMs(2, 45_000)).toBe(90_000);
    expect(backoffMs(3, 45_000)).toBe(180_000);
  });

  it('is capped, so a long outage does not become an exponential wait', () => {
    expect(backoffMs(10, 45_000)).toBe(BACKOFF_CAP_MS);
    expect(backoffMs(99, 45_000)).toBe(BACKOFF_CAP_MS);
  });

  it('never returns a delay shorter than the cadence it started from', () => {
    for (const failures of [1, 2, 3, 4, 5]) {
      expect(backoffMs(failures, CLIENT_MIN_POLL_MS)).toBeGreaterThanOrEqual(CLIENT_MIN_POLL_MS);
    }
  });
});
