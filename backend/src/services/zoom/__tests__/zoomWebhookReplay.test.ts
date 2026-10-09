import { judgeDeliveryFreshness, deliveryKey, REPLAY_WINDOW_MS } from '../zoomWebhookReplay';

/**
 * A valid Zoom signature proves a delivery was genuine WHEN IT WAS MADE. It never
 * expires, so a captured request can be replayed verbatim forever. The timestamp is
 * inside the HMAC input, so it cannot be altered without breaking the signature —
 * which is exactly what makes it worth checking.
 */

const NOW = Date.parse('2026-11-20T19:00:00Z');
const secondsAt = (iso: string) => String(Math.floor(Date.parse(iso) / 1000));

describe('a signed delivery still has to be recent', () => {
  it('accepts one sent just now', () => {
    const v = judgeDeliveryFreshness(secondsAt('2026-11-20T19:00:00Z'), NOW);
    expect(v.fresh).toBe(true);
  });

  it('accepts a late retry inside the window — Zoom retries on its own schedule', () => {
    // A window that rejects a legitimate retry loses a recording permanently,
    // which is worse than accepting a replay of an idempotent event.
    const v = judgeDeliveryFreshness(secondsAt('2026-11-20T18:50:00Z'), NOW);
    expect(v.fresh).toBe(true);
  });

  it('REJECTS a replay of an old capture', () => {
    const v = judgeDeliveryFreshness(secondsAt('2026-11-20T18:00:00Z'), NOW);
    expect(v.fresh).toBe(false);
    if (v.fresh) return;
    expect(v.reason).toBe('too_old');
  });

  it('REJECTS a timestamp far in the future, which would otherwise never expire', () => {
    // Without this bound, a forged-forward timestamp stays "fresh" indefinitely
    // and the whole check is decorative.
    const v = judgeDeliveryFreshness(secondsAt('2026-11-20T21:00:00Z'), NOW);
    expect(v.fresh).toBe(false);
    if (v.fresh) return;
    expect(v.reason).toBe('too_far_ahead');
  });

  it('rejects a missing header rather than defaulting to now', () => {
    expect(judgeDeliveryFreshness(undefined, NOW)).toMatchObject({ fresh: false, reason: 'missing' });
  });

  it('rejects a header that is not a number', () => {
    expect(judgeDeliveryFreshness('not-a-timestamp', NOW)).toMatchObject({ fresh: false, reason: 'malformed' });
  });

  it('reads SECONDS, which is what Zoom sends', () => {
    // Treating seconds as milliseconds dates every delivery to 1970 and rejects
    // all of them — the kind of unit bug that looks like an outage.
    const v = judgeDeliveryFreshness(secondsAt('2026-11-20T19:00:00Z'), NOW);
    expect(v.fresh).toBe(true);
    if (!v.fresh) return;
    expect(Math.abs(v.ageMs)).toBeLessThan(1000);
  });

  it('still understands a millisecond-scale value, rather than rejecting it', () => {
    const v = judgeDeliveryFreshness(String(NOW), NOW);
    expect(v.fresh).toBe(true);
  });

  it('is symmetric about now', () => {
    const justInside = NOW - (REPLAY_WINDOW_MS - 1000);
    const justOutside = NOW - (REPLAY_WINDOW_MS + 1000);
    expect(judgeDeliveryFreshness(String(justInside), NOW).fresh).toBe(true);
    expect(judgeDeliveryFreshness(String(justOutside), NOW).fresh).toBe(false);
  });
});

describe('the delivery key collapses retries, not distinct events', () => {
  it('is the same for a retry of the same event', () => {
    // Zoom's retry carries a NEW timestamp. Including the timestamp in the key
    // would make every retry a fresh event and defeat the dedupe.
    const a = deliveryKey('recording.completed', 'OCC==', '123');
    const b = deliveryKey('recording.completed', 'OCC==', '123');
    expect(a).toBe(b);
  });

  it('differs between two occurrences of the same meeting', () => {
    const first = deliveryKey('recording.completed', 'OCC-1==', '123');
    const second = deliveryKey('recording.completed', 'OCC-2==', '123');
    expect(first).not.toBe(second);
  });

  it('differs between event types for one occurrence', () => {
    expect(deliveryKey('recording.completed', 'OCC==', '123'))
      .not.toBe(deliveryKey('recording.transcript_completed', 'OCC==', '123'));
  });

  it('falls back to the meeting id when no occurrence uuid is present', () => {
    // Better a coarse key than none: without one, every retry of a uuid-less
    // payload would be treated as a brand new event.
    expect(deliveryKey('recording.completed', '', '123')).toBe('recording.completed:meeting:123');
  });
});
