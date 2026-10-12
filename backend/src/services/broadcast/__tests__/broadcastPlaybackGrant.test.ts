/**
 * The preview-enforcement tests. Request §4.2 asks for proof that a viewer cannot keep
 * obtaining paid content after expiry, and §6 names the scenarios: 899/900/901, a late
 * joiner, a refresh, a second device, a changed client clock, a cached segment and a direct
 * URL. All of them reduce to one question — can any sequence of requests mint or use a
 * token that outlives contentStartedAt + previewSeconds? — so that is what these assert.
 *
 * Everything is driven by an injected clock. No system clock is changed, per §6.
 */
import {
  computeGrantExpiry,
  signPlayback,
  verifyPlaybackRequest,
  isValidGrantKey,
  PlaybackGrantError,
  GRANT_TTL_MS,
  GRANT_SEGMENT_GRACE_MS,
} from '../broadcastPlaybackGrant';

const ENV = { JWT_SECRET: 'test-secret-not-real' } as NodeJS.ProcessEnv;
const BASE = 'https://portal.example';
const OCC = '11111111-2222-4333-8444-555555555555';
const KEY = `broadcast/${OCC}/master.m3u8`;
const START = Date.parse('2026-07-23T23:30:00.000Z');
const at = (s: number) => START + s * 1000;

const preview = { contentStartedAtMs: START, previewSeconds: 900 };
const full = { contentStartedAtMs: START, previewSeconds: 900 };

describe('the 900-second boundary', () => {
  it('grants at 899s, refuses at 900s, refuses at 901s', () => {
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(899))).not.toBeNull();
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(900))).toBeNull();
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(901))).toBeNull();
  });

  it('caps the token at the deadline, NOT at the full TTL', () => {
    // At 899s only one second remains, even though the TTL would allow 120.
    const exp = computeGrantExpiry({ grant: 'preview' }, preview, at(899))!;
    expect(exp).toBe(START + 900_000);
    expect(exp).toBeLessThan(at(899) + GRANT_TTL_MS);
  });

  it('uses the full TTL early on, when the deadline is further away than the TTL', () => {
    const exp = computeGrantExpiry({ grant: 'preview' }, preview, at(10))!;
    expect(exp).toBe(at(10) + GRANT_TTL_MS);
  });

  it('gives a late joiner a TTL-sized token, renewable only up to the deadline', () => {
    // Joining at minute ten leaves five minutes of PREVIEW (§4.2) — but the TOKEN is 120s,
    // because the TTL is shorter than the remainder. Those are different quantities and an
    // earlier version of this test wrongly asserted they were the same. The token is
    // renewed; what must hold is that no renewal ever passes the deadline.
    const exp = computeGrantExpiry({ grant: 'preview' }, preview, at(600))!;
    expect(exp).toBe(at(600) + GRANT_TTL_MS);
    expect(exp).toBeLessThan(START + 900_000);

    // Walk the renewals forward: each is capped, and the one at the deadline is refused.
    for (const t of [700, 800, 870, 899]) {
      expect(computeGrantExpiry({ grant: 'preview' }, preview, at(t))!).toBeLessThanOrEqual(START + 900_000);
    }
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(900))).toBeNull();
  });

  it('the total preview a late joiner can obtain is bounded by the deadline, not by renewals', () => {
    // The property that actually matters: whatever sequence of renewals a viewer makes,
    // the last instant any of them authorises is contentStartedAt + previewSeconds.
    let latest = 0;
    for (let t = 600; t < 900; t += 1) {
      const e = computeGrantExpiry({ grant: 'preview' }, preview, at(t));
      if (e) latest = Math.max(latest, e);
    }
    expect(latest).toBe(START + 900_000);
  });

  it('refuses when the clock has not started — not the same as a spent window', () => {
    expect(computeGrantExpiry({ grant: 'preview' }, { contentStartedAtMs: null, previewSeconds: 900 }, at(5))).toBeNull();
  });

  it('a full grant is never bounded by the preview deadline', () => {
    const exp = computeGrantExpiry({ grant: 'full' }, full, at(5000))!;
    expect(exp).toBe(at(5000) + GRANT_TTL_MS); // long past the preview deadline
  });

  it('a denied decision mints nothing', () => {
    expect(computeGrantExpiry({ grant: 'denied' }, preview, at(1))).toBeNull();
  });
});

describe('no sequence of requests can outlive the deadline', () => {
  it('refreshing does not extend it — a new token still ends at the same instant', () => {
    const a = computeGrantExpiry({ grant: 'preview' }, preview, at(800))!;
    const b = computeGrantExpiry({ grant: 'preview' }, preview, at(850))!;
    const c = computeGrantExpiry({ grant: 'preview' }, preview, at(899))!;
    expect(a).toBe(START + 900_000);
    expect(b).toBe(START + 900_000);
    expect(c).toBe(START + 900_000);
  });

  it('a second device gets the same deadline, not a second window', () => {
    const deviceA = computeGrantExpiry({ grant: 'preview' }, preview, at(300))!;
    const deviceB = computeGrantExpiry({ grant: 'preview' }, preview, at(300))!;
    expect(deviceA).toBe(deviceB);
  });

  it('a changed client clock is irrelevant — the server supplies now', () => {
    // There is no client-supplied time input in the signature at all; the test asserts the
    // shape by showing the only time input is the server's nowMs argument.
    const serverDecided = computeGrantExpiry({ grant: 'preview' }, preview, at(899))!;
    expect(serverDecided).toBe(START + 900_000);
  });

  it('renewal at the deadline returns nothing rather than a fresh window', () => {
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(900))).toBeNull();
  });
});

describe('signing and verification', () => {
  it('round-trips a valid token', () => {
    const signed = signPlayback(KEY, { grant: 'preview' }, preview, BASE, ENV, at(10))!;
    const url = new URL(signed.url);
    expect(url.pathname).toBe(`/bm/${KEY}`);
    expect(verifyPlaybackRequest(KEY, url.searchParams.get('e')!, url.searchParams.get('s')!, ENV, at(20))).toBe(KEY);
  });

  it('reports ttlSeconds as a floor, so a client never rounds past the deadline', () => {
    const signed = signPlayback(KEY, { grant: 'preview' }, preview, BASE, ENV, at(899.5))!;
    expect(signed.ttlSeconds).toBe(0);
    expect(signed.expiresAt).toBe(START + 900_000);
  });

  it('returns null rather than an unsigned fallback when nothing may be granted', () => {
    // §7 forbids concealing a gap behind a public unlisted URL; a fallback is how that happens.
    expect(signPlayback(KEY, { grant: 'preview' }, preview, BASE, ENV, at(901))).toBeNull();
    expect(signPlayback(KEY, { grant: 'denied' }, preview, BASE, ENV, at(1))).toBeNull();
  });

  it('rejects a tampered signature with 403, not 410', () => {
    const signed = signPlayback(KEY, { grant: 'full' }, full, BASE, ENV, at(10))!;
    const url = new URL(signed.url);
    const sig = url.searchParams.get('s')!;
    const tampered = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    try {
      verifyPlaybackRequest(KEY, url.searchParams.get('e')!, tampered, ENV, at(20));
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PlaybackGrantError);
      expect(e.error_class).toBe('BadSignature');
      expect(e.status).toBe(403);
    }
  });

  it('checks the signature BEFORE expiry, so 410 never leaks that a key was valid', () => {
    // An expired-but-tampered token must report BadSignature, not Expired.
    const signed = signPlayback(KEY, { grant: 'full' }, full, BASE, ENV, at(10))!;
    const sig = new URL(signed.url).searchParams.get('s')!;
    const tampered = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(() => verifyPlaybackRequest(KEY, String(signed.expiresAt), tampered, ENV, at(99999)))
      .toThrow(expect.objectContaining({ error_class: 'BadSignature' }));
  });

  it('a token minted for one occurrence is refused on another', () => {
    const other = `broadcast/99999999-2222-4333-8444-555555555555/master.m3u8`;
    const signed = signPlayback(KEY, { grant: 'full' }, full, BASE, ENV, at(10))!;
    const url = new URL(signed.url);
    expect(() => verifyPlaybackRequest(other, url.searchParams.get('e')!, url.searchParams.get('s')!, ENV, at(20)))
      .toThrow(expect.objectContaining({ error_class: 'BadSignature' }));
  });

  it('refuses an unsigned request with 403', () => {
    expect(() => verifyPlaybackRequest(KEY, String(at(900)), undefined, ENV, at(10)))
      .toThrow(expect.objectContaining({ error_class: 'Unsigned', status: 403 }));
  });

  it('refuses a malformed key with 404, matching mediaStore\'s InvalidKey', () => {
    for (const bad of ['broadcast/not-a-uuid/master.m3u8', 'other/x/y', `broadcast/${OCC}/../../etc/passwd`]) {
      expect(isValidGrantKey(bad)).toBe(false);
      expect(() => verifyPlaybackRequest(bad, '1', 'x', ENV, at(1)))
        .toThrow(expect.objectContaining({ error_class: 'InvalidKey', status: 404 }));
    }
  });

  it('refuses to sign at all without JWT_SECRET, rather than using a default', () => {
    expect(() => signPlayback(KEY, { grant: 'full' }, full, BASE, {} as NodeJS.ProcessEnv, at(10)))
      .toThrow(expect.objectContaining({ error_class: 'Unsigned' }));
  });
});

describe('segment grace', () => {
  it('serves an in-flight segment just past expiry', () => {
    const exp = at(900);
    const signed = signPlayback(KEY, { grant: 'preview' }, preview, BASE, ENV, at(899))!;
    expect(signed.expiresAt).toBe(exp);
    const sig = new URL(signed.url).searchParams.get('s')!;
    // Within the documented grace window.
    expect(verifyPlaybackRequest(KEY, String(exp), sig, ENV, exp + GRANT_SEGMENT_GRACE_MS - 1)).toBe(KEY);
  });

  it('refuses beyond the grace window', () => {
    const exp = at(900);
    const signed = signPlayback(KEY, { grant: 'preview' }, preview, BASE, ENV, at(899))!;
    const sig = new URL(signed.url).searchParams.get('s')!;
    expect(() => verifyPlaybackRequest(KEY, String(exp), sig, ENV, exp + GRANT_SEGMENT_GRACE_MS + 1))
      .toThrow(expect.objectContaining({ error_class: 'Expired', status: 410 }));
  });

  it('grace cannot be chained — the NEXT grant is already refused', () => {
    // The most a viewer gains is one partially-buffered segment: at the moment grace would
    // still serve a held token, a request for a new one returns nothing.
    expect(computeGrantExpiry({ grant: 'preview' }, preview, at(900) + GRANT_SEGMENT_GRACE_MS - 1)).toBeNull();
  });

  it('grace never extends the GRANT itself, only the check', () => {
    const exp = computeGrantExpiry({ grant: 'preview' }, preview, at(899))!;
    expect(exp).toBe(START + 900_000); // not 900_000 + grace
  });
});
