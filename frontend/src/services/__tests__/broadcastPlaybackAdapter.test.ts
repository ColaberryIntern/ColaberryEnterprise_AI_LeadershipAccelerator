import {
  createPlaybackAdapter,
  redactMediaUrl,
  backoffMs,
  renewDelayMs,
  reasonFromGrantError,
  resolveAgainstApiBase,
  RENEW_LEAD_MS,
  MIN_RENEW_DELAY_MS,
  MAX_RECOVERY_ATTEMPTS,
  GrantResponse,
  PlaybackSnapshot,
} from '../broadcastPlaybackAdapter';

/**
 * The replay playback adapter. Six failure modes the spec names, plus the rule that shapes
 * all of them: a signed URL must never reach an error surface.
 *
 * Time and timers are INJECTED rather than faked globally, so every assertion about "when"
 * is an exact number rather than a tolerance. There is no DOM here and no renderer: the
 * adapter is deliberately React-free, and a test that needed a component to check a backoff
 * curve would be testing the wrong thing.
 */
import {
  harness, grant, flush, refusal, OCC, ASSET, T0, SIG,
} from '../testSupport/broadcastPlaybackHarness';

describe('pure helpers', () => {
  it('redactMediaUrl keeps the key and destroys the signature', () => {
    const red = redactMediaUrl(`/bm/broadcast/${OCC}/${ASSET}?e=${T0}&s=${SIG}`);
    expect(red).toContain(`/bm/broadcast/${OCC}/${ASSET}`);
    expect(red).not.toContain(SIG);
    expect(red).not.toContain(String(T0));
  });

  it('backoff is capped, not unbounded', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([500, 1000, 2000, 4000, 8000, 8000]);
  });

  it('renew fires a lead time before expiry', () => {
    expect(renewDelayMs(T0 + 120_000, T0)).toBe(120_000 - RENEW_LEAD_MS);
  });

  it('a credential already inside the lead window renews soon, not instantly and forever', () => {
    // Without the clamp this returns <= 0 and the scheduler spins.
    expect(renewDelayMs(T0 + 5_000, T0)).toBe(MIN_RENEW_DELAY_MS);
    expect(renewDelayMs(T0 - 60_000, T0)).toBe(MIN_RENEW_DELAY_MS);
  });

  it('classifies a 403 by its reason and carries the upgrade offer', () => {
    expect(reasonFromGrantError({ response: { status: 403, data: { reason: 'preview_expired', offer_upgrade: true } } }))
      .toEqual({ reason: 'preview_expired', offerUpgrade: true });
    expect(reasonFromGrantError({ response: { status: 403, data: { reason: 'not_room_eligible' } } }))
      .toEqual({ reason: 'not_room_eligible', offerUpgrade: false });
  });

  it('an unrecognised 403 reason is still a denial, never a retry', () => {
    expect(reasonFromGrantError({ response: { status: 403, data: { reason: 'something_new' } } }).reason)
      .toBe('not_entitled');
  });

  it('treats a 5xx, a 429 and a bare network failure as recoverable, not as a denial', () => {
    for (const err of [
      { response: { status: 500 } },
      { response: { status: 502 } },
      { response: { status: 429 } },
      new Error('Network Error'),
      {},
    ]) {
      expect(reasonFromGrantError(err).reason).toBe('upstream_unavailable');
    }
  });

  it('resolves a relative media url against a configured API base, and leaves absolutes alone', () => {
    expect(resolveAgainstApiBase('/bm/x', '')).toBe('/bm/x');
    expect(resolveAgainstApiBase('/bm/x', 'https://api.example.com')).toBe('https://api.example.com/bm/x');
    expect(resolveAgainstApiBase('/bm/x', 'https://api.example.com/')).toBe('https://api.example.com/bm/x');
    expect(resolveAgainstApiBase('https://cdn/x', 'https://api.example.com')).toBe('https://cdn/x');
  });
});

describe('the happy path', () => {
  it('loads, points the element at the signed url, plays, and arms a renewal', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    expect(h.snapshots.map((s) => s.phase)).toEqual(['loading', 'playing']);
    expect(h.media.src).toBe(grant().url);
    expect(h.media.play).toHaveBeenCalledTimes(1);
    expect(h.adapter.snapshot().credentialExpiresAt).toBe(T0 + 120_000);
    expect(h.pending).toEqual([120_000 - RENEW_LEAD_MS]);
  });

  it('reports the remaining preview window for a preview viewer', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant({ grant: 'preview', preview_seconds_remaining: 840 }));
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().previewSecondsRemaining).toBe(840);
  });
});

describe('a denial is terminal — retrying one is how a paywall becomes a formality', () => {
  it('stops dead on an expired preview, clears the source, and offers the upgrade', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'preview_expired', offer_upgrade: true } } });
    h.adapter.start();
    await flush();

    const s = h.adapter.snapshot();
    expect(s).toMatchObject({ phase: 'denied', reason: 'preview_expired', offerUpgrade: true });
    // No source left behind: nothing should keep requesting ranges after a denial.
    expect(h.media.src).toBe('');
    // And crucially, no retry was armed and no second request was made.
    expect(h.pending).toEqual([]);
    expect(h.fetchGrant).toHaveBeenCalledTimes(1);
  });

  it('stops dead on a 404', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue({ response: { status: 404 } });
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot()).toMatchObject({ phase: 'denied', reason: 'not_found' });
    expect(h.pending).toEqual([]);
  });

  it('ignores a restart after a denial', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_entitled' } } });
    h.adapter.start();
    await flush();
    h.adapter.start();
    await flush();
    expect(h.fetchGrant).toHaveBeenCalledTimes(1);
  });
});

describe('an outage is recoverable, but only within a bounded budget', () => {
  it('retries on the documented backoff curve and then gives up', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue(new Error('Network Error'));
    h.adapter.start();
    await flush();

    const delays: number[] = [];
    for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i += 1) {
      expect(h.pending).toHaveLength(1);
      delays.push(h.pending[0]);
      await h.fire();
    }

    expect(delays).toEqual([500, 1000, 2000, 4000]);
    expect(h.adapter.snapshot()).toMatchObject({ phase: 'failed', reason: 'retries_exhausted' });
    expect(h.media.src).toBe('');
    // Bounded: nothing is left armed, and the request count is attempts + the first try.
    expect(h.pending).toEqual([]);
    expect(h.fetchGrant).toHaveBeenCalledTimes(MAX_RECOVERY_ATTEMPTS + 1);
  });

  it('a success inside the budget resets it, so the next outage gets a full set of attempts', async () => {
    const h = harness();
    h.fetchGrant
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().attempt).toBe(1);
    await h.fire();
    expect(h.adapter.snapshot().attempt).toBe(2);
    await h.fire();

    expect(h.adapter.snapshot()).toMatchObject({ phase: 'playing', attempt: 0, reason: null });
  });
});

describe('credential expiry mid-playback — the reason this module exists', () => {
  async function playing(h: ReturnType<typeof harness>) {
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
  }

  it('renews before expiry and puts the viewer back where they were', async () => {
    const h = harness();
    await playing(h);

    h.media.currentTime = 1_337;
    const renewed = grant({
      url: `/bm/broadcast/${OCC}/${ASSET}?e=${T0 + 240_000}&s=renewed`,
      expires_at: T0 + 240_000,
    });
    h.fetchGrant.mockResolvedValue(renewed);

    await h.fire();

    expect(h.media.src).toBe(renewed.url);
    // The position is restored only once the new source has metadata — before that,
    // assigning currentTime would be discarded by the element.
    expect(h.media.currentTime).toBe(1_337);
    h.media.currentTime = 0;
    h.emitMedia('loadedmetadata');
    expect(h.media.currentTime).toBe(1_337);
    expect(h.media.play).toHaveBeenCalledTimes(2);
    expect(h.adapter.snapshot()).toMatchObject({ phase: 'playing', credentialExpiresAt: T0 + 240_000 });
  });

  /**
   * THE 15 OCTOBER 2026 DEFECT, pinned.
   *
   * The first production airing replayed the last ~100 seconds on every credential renewal.
   * Two viewers reported it independently as "the last lines keep repeating". The cause was
   * that a LIVE renewal restored the viewer's old position, as a replay renewal correctly
   * does — but a live manifest restarts its timeline on reload, so restoring seeks backwards
   * into the DVR buffer instead of staying at the live edge.
   *
   * The test above proves restoring is still right for a replay. This one proves it is not
   * done for live. Both must pass: the two cases are genuinely different.
   */
  it('a LIVE renewal does NOT seek backwards - the viewer stays at the live edge', async () => {
    const h = harness();
    await playing(h);

    h.media.currentTime = 1_337;
    const renewed = grant({
      url: 'https://customer-keedfbz9hwevyrdm.cloudflarestream.com/TOKEN/manifest/video.m3u8',
      expires_at: T0 + 240_000,
      is_live: true,
    });
    h.fetchGrant.mockResolvedValue(renewed);

    await h.fire();

    expect(h.media.src).toBe(renewed.url);
    // Playback resumes immediately rather than waiting on a restore that must not happen.
    expect(h.media.play).toHaveBeenCalledTimes(2);

    // The element reloads and reports metadata. Nothing may drag the viewer back to 1337.
    h.media.currentTime = 0;
    h.emitMedia('loadedmetadata');
    expect(h.media.currentTime).toBe(0);
  });

  it('a live viewer who PAUSED is still not un-paused by a renewal', async () => {
    const h = harness();
    await playing(h);
    h.media.currentTime = 500;
    h.media.paused = true;
    h.fetchGrant.mockResolvedValue(grant({ expires_at: T0 + 240_000, is_live: true }));

    await h.fire();

    // Two calls would mean the renewal restarted a video the viewer deliberately stopped.
    expect(h.media.play).toHaveBeenCalledTimes(1);
  });

  it('does NOT un-pause a video the viewer deliberately paused', async () => {
    const h = harness();
    await playing(h);
    h.media.currentTime = 42;
    h.media.paused = true;
    h.fetchGrant.mockResolvedValue(grant({ expires_at: T0 + 240_000 }));

    await h.fire();
    h.emitMedia('loadedmetadata');

    expect(h.media.currentTime).toBe(42);
    expect(h.media.play).toHaveBeenCalledTimes(1);   // the initial play only
  });

  it('restores the position exactly once, not on every later metadata event', async () => {
    const h = harness();
    await playing(h);
    h.media.currentTime = 500;
    h.fetchGrant.mockResolvedValue(grant({ expires_at: T0 + 240_000 }));
    await h.fire();

    h.emitMedia('loadedmetadata');
    expect(h.media.currentTime).toBe(500);
    // A later seek then a later metadata event must not yank the viewer back.
    h.media.currentTime = 900;
    h.emitMedia('loadedmetadata');
    expect(h.media.currentTime).toBe(900);
  });

  it('ENDS playback when the preview window closes mid-stream', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant({ grant: 'preview', preview_seconds_remaining: 90 }));
    h.adapter.start();
    await flush();

    // The renewal is refused because the deadline passed. This is the server-side cutoff
    // arriving mid-playback, and it must be terminal rather than retried.
    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'preview_expired', offer_upgrade: true } } });
    await h.fire();

    expect(h.adapter.snapshot()).toMatchObject({ phase: 'denied', reason: 'preview_expired', offerUpgrade: true });
    expect(h.media.src).toBe('');
    expect(h.pending).toEqual([]);
  });

  it('retries a renewal that failed on an outage rather than ending the replay', async () => {
    const h = harness();
    await playing(h);
    h.fetchGrant.mockRejectedValue({ response: { status: 503 } });
    await h.fire();

    expect(h.adapter.snapshot()).toMatchObject({ reason: 'upstream_unavailable', attempt: 1 });
    expect(h.pending).toEqual([500]);
  });
});

describe('the element itself failing', () => {
  it('reads a media error after expiry as a dead credential and gets a new one', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    h.advanceTo(T0 + 121_000);          // past expiry; a range request would now 410
    h.emitMedia('error');

    expect(h.adapter.snapshot()).toMatchObject({ reason: 'credential_expired', attempt: 1 });
    expect(h.pending).toEqual([500]);
  });

  it('reads a media error while the credential is still valid as a transport problem', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    h.advanceTo(T0 + 1_000);
    h.emitMedia('error');

    expect(h.adapter.snapshot()).toMatchObject({ reason: 'media_error', attempt: 1 });
  });

  it('ignores a media error raised after a denial', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'preview_expired' } } });
    h.adapter.start();
    await flush();
    h.emitMedia('error');
    expect(h.adapter.snapshot().phase).toBe('denied');
    expect(h.pending).toEqual([]);
  });

  it('ends cleanly and disarms the renewal', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    h.emitMedia('ended');

    expect(h.adapter.snapshot()).toMatchObject({ phase: 'ended', credentialExpiresAt: null });
    expect(h.pending).toEqual([]);
  });
});

describe('teardown', () => {
  it('clears the source and the timer so nothing carries a live credential onward', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    h.adapter.stop();

    expect(h.media.src).toBe('');
    expect(h.pending).toEqual([]);
    expect(h.adapter.snapshot().phase).toBe('idle');
  });

  it('a grant that lands AFTER stop() does not resurrect playback', async () => {
    const h = harness();
    let release: (g: GrantResponse) => void = () => undefined;
    h.fetchGrant.mockReturnValue(new Promise<GrantResponse>((res) => { release = res; }));
    h.adapter.start();
    h.adapter.stop();

    release(grant());
    await flush();

    expect(h.media.src).toBe('');
    expect(h.adapter.snapshot().phase).toBe('idle');
  });

  it('stops listening, so a later media event is inert', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    h.adapter.stop();
    h.emitMedia('error');
    expect(h.adapter.snapshot().phase).toBe('idle');
  });
});

describe('a superseded request never lands on current state', () => {
  it('ignores a grant that resolves LATE, after a newer one has already won', async () => {
    // The gap a surviving mutation found. The teardown test next door is caught by the
    // `stopped` flag alone, so it proved nothing about the generation guard. This is the case
    // the guard actually exists for: two acquisitions overlap WITHOUT a stop(), the first
    // resolves last, and without the guard its stale credential overwrites the fresh one -
    // leaving the element pointed at a URL that is closer to expiry than the one it replaced.
    const h = harness();

    let releaseFirst: (g: GrantResponse) => void = () => undefined;
    const first = grant({
      url: `/bm/broadcast/${OCC}/${ASSET}?e=${T0 + 120_000}&s=stale`,
      expires_at: T0 + 120_000,
    });
    const second = grant({
      url: `/bm/broadcast/${OCC}/${ASSET}?e=${T0 + 600_000}&s=fresh`,
      expires_at: T0 + 600_000,
    });

    h.fetchGrant.mockReturnValueOnce(new Promise<GrantResponse>((res) => { releaseFirst = res; }));
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().phase).toBe('loading');

    // A media error while the first request is still in flight starts a second acquisition.
    h.emitMedia('error');
    h.fetchGrant.mockResolvedValue(second);
    await h.fire();

    expect(h.media.src).toBe(second.url);
    expect(h.adapter.snapshot().credentialExpiresAt).toBe(T0 + 600_000);

    // Now the original request finally answers. It must be discarded.
    releaseFirst(first);
    await flush();

    expect(h.media.src).toBe(second.url);
    expect(h.adapter.snapshot().credentialExpiresAt).toBe(T0 + 600_000);
    // And it must not have armed a second renewal on top of the live one.
    expect(h.pending).toHaveLength(1);
  });
});
