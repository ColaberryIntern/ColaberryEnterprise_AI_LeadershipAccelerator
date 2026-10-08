import {
  resolvePollAfterMs,
  MIN_POLL_MS,
  MAX_POLL_MS,
  DEFAULT_POLL_MS,
} from '../broadcastPollPolicy';

/**
 * The server half of the P3-09 bound.
 *
 * The cadence is server-controlled so it can be slowed by an env change during an incident
 * rather than a frontend deploy. That makes an operator typo the realistic failure mode, and
 * both directions of it matter: `BROADCAST_DISCOVERY_POLL_MS=1000` would turn every
 * signed-in tab into a load test, and `=3600000` would leave a "live now" badge an hour out
 * of date while still claiming to be live.
 */

describe('an operator typo cannot become an incident', () => {
  it('accepts a sane value unchanged', () => {
    expect(resolvePollAfterMs('45000')).toBe(45_000);
    expect(resolvePollAfterMs('60000')).toBe(60_000);
    expect(resolvePollAfterMs('120000')).toBe(120_000);
  });

  it('raises anything below the floor', () => {
    expect(resolvePollAfterMs('1000')).toBe(MIN_POLL_MS);
    expect(resolvePollAfterMs('0')).toBe(MIN_POLL_MS);
    expect(resolvePollAfterMs('-30000')).toBe(MIN_POLL_MS);
  });

  it('lowers anything above the ceiling', () => {
    expect(resolvePollAfterMs('3600000')).toBe(MAX_POLL_MS);
  });

  it('falls back to the default rather than to NaN', () => {
    // parseInt returns NaN for each of these, and NaN survives Math.min/Math.max untouched —
    // so without the explicit guard the endpoint would answer `poll_after_ms: null` and the
    // client would fall back on its own, silently ignoring the setting.
    for (const bad of [undefined, '', '   ', 'soon', 'forty-five', 'null']) {
      expect(resolvePollAfterMs(bad)).toBe(DEFAULT_POLL_MS);
    }
  });

  it('reads a value with trailing junk as its leading number, then clamps it', () => {
    // parseInt('45000ms') is 45000. Documented rather than guarded: it is the forgiving
    // direction, and the clamp still bounds whatever comes out.
    expect(resolvePollAfterMs('45000ms')).toBe(45_000);
    expect(resolvePollAfterMs('5s')).toBe(MIN_POLL_MS);
  });

  it('keeps the default inside its own bounds — a default outside them is a latent bug', () => {
    expect(DEFAULT_POLL_MS).toBeGreaterThanOrEqual(MIN_POLL_MS);
    expect(DEFAULT_POLL_MS).toBeLessThanOrEqual(MAX_POLL_MS);
  });

  it('pins the three NUMBERS, not just their relationship', () => {
    // Every other assertion here compares against the constants, so changing a constant made
    // them all still pass — the 15s/300s window was unpinned, which an independent check
    // flagged. The client half is pinned to literals too
    // (`liveNowBadge.test.tsx` expects exactly 15_000), and these must agree: the client
    // clamps what the server sends, so two different windows would silently mean the tighter
    // one always wins and the setting would stop behaving as documented.
    expect(MIN_POLL_MS).toBe(15_000);
    expect(MAX_POLL_MS).toBe(300_000);
    expect(DEFAULT_POLL_MS).toBe(45_000);
  });
});
