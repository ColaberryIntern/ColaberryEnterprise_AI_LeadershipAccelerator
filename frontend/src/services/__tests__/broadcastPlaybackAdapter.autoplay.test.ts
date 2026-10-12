import { MAX_RECOVERY_ATTEMPTS } from '../broadcastPlaybackAdapter';
import {
  harness, grant, flush, refusal, OCC, ASSET, T0, SIG,
} from '../testSupport/broadcastPlaybackHarness';

/**
 * Denied autoplay, on its own because it is the one failure the BROWSER causes rather than
 * the server or the network, and the only one a retry cannot clear.
 *
 * Split out of `broadcastPlaybackAdapter.test.ts` when that file passed the 500-line ceiling.
 * A MOVE: no assertion here was changed.
 */

describe('denied autoplay is reported, not swallowed', () => {
  /**
   * `media.play()` REJECTS with NotAllowedError when the browser wants a user gesture.
   * Chrome and Safari both refuse unmuted autoplay by default, so this is the ordinary first
   * experience, not an edge case — and until this landed the adapter did `void media.play()`,
   * discarding the rejection. The viewer got a loaded, silent, paused video and the snapshot
   * still said `phase: 'playing'`.
   *
   * These tests assert on the FLAG and on the absence of a retry, because the two things that
   * can go wrong are opposite: saying nothing, or spending the recovery budget on a refusal
   * that no retry can clear.
   */
  it('raises autoplayBlocked when the initial play is refused', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());

    h.adapter.start();
    await flush();

    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);
    // Still 'playing' as far as the credential lifecycle goes: the element is loaded and the
    // renewal is armed. It is paused, not broken — conflating the two would send the UI to an
    // error surface and lose the viewer's place.
    expect(h.adapter.snapshot().phase).toBe('playing');
    expect(h.pending.length).toBe(1);
  });

  it('does NOT spend a recovery attempt on a refusal', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());

    h.adapter.start();
    await flush();

    // A refusal is not an outage. Backing off and re-fetching a credential would burn the
    // budget AND mint a second signed url, for a condition only a click can clear.
    expect(h.adapter.snapshot().attempt).toBe(0);
    expect(h.adapter.snapshot().reason).toBeNull();
    expect(h.fetchGrant).toHaveBeenCalledTimes(1);
  });

  it('logs the error NAME and never the signed url', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());

    h.adapter.start();
    await flush();

    const line = h.logs.find((l) => l.includes('broadcast_playback_autoplay_blocked'));
    expect(line).toBeDefined();
    expect(line).toContain('error=NotAllowedError');
    expect(line).toContain('context=load');
    // The browser's own message for this quotes the document; a media-element error can
    // quote the source. Neither goes in a log line.
    expect(line).not.toContain(SIG);
    expect(line).not.toContain('/bm/');
  });

  it('reports a refusal on RENEWAL, which is the case that silently stops a replay', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(false);

    // Ninety minutes into a replay, the credential renews, `src` is swapped, and the element
    // reloads. If play() is refused here the video just stops — with the old code, silently.
    h.media.currentTime = 1_200;
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant({ expires_at: T0 + 240_000 }));
    await h.fire();
    h.emitMedia('loadedmetadata');
    await flush();

    expect(h.media.currentTime).toBe(1_200);
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);
    const line = h.logs.find((l) => l.includes('broadcast_playback_autoplay_blocked'));
    expect(line).toContain('context=renewal');
  });

  it('clears the flag when resume() succeeds', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);

    h.adapter.resume();          // the UI calls this from a click handler
    await flush();

    expect(h.adapter.snapshot().autoplayBlocked).toBe(false);
    expect(h.media.play).toHaveBeenCalledTimes(2);
  });

  it('keeps the flag up when resume() is refused again', async () => {
    const h = harness();
    h.media.play.mockRejectedValue(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    h.adapter.resume();
    await flush();

    // The control must stay on screen. A button that disappears on a failed press is worse
    // than one that does nothing.
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);
  });

  it('resume() does nothing once the server has denied access', async () => {
    const h = harness();
    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_entitled' } } });
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().phase).toBe('denied');
    const before = h.media.play.mock.calls.length;

    h.adapter.resume();
    await flush();

    // There is no src to play and no entitlement behind it; calling play() here would ask
    // the element to replay whatever it last held.
    expect(h.media.play).toHaveBeenCalledTimes(before);
  });

  it('survives an element that throws synchronously instead of rejecting', async () => {
    const h = harness();
    h.media.play.mockImplementationOnce(() => { throw refusal(); });
    h.fetchGrant.mockResolvedValue(grant());

    h.adapter.start();
    await flush();

    // Older WebKit threw rather than returning a rejected promise. An uncaught throw here
    // would abort acquire() BEFORE the renewal timer is armed, so the credential would
    // expire and never renew — a dead player 120 seconds later.
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);
    expect(h.pending.length).toBe(1);
  });

  it('tolerates an element whose play() returns void', async () => {
    const h = harness();
    h.media.play.mockReturnValueOnce(undefined as unknown as Promise<void>);
    h.fetchGrant.mockResolvedValue(grant());

    h.adapter.start();
    await flush();

    // There is nothing to observe, so the only correct answer is "not blocked". The `error`
    // listener still covers a real media failure.
    expect(h.adapter.snapshot().autoplayBlocked).toBe(false);
    expect(h.adapter.snapshot().phase).toBe('playing');
  });

  it('clears the flag when the viewer presses the ELEMENT\'s own play control', async () => {
    // The gap an independent check found, and the one that mattered most: the <video> carries
    // native `controls`, so the obvious gesture never passes through `resume()`. Without a
    // `play` listener the flag stayed true for the whole replay — a "Play" button and a
    // "your browser blocked playback" message on top of a video that was playing fine.
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);

    // Exactly what the browser emits when the native control is pressed. No call to
    // resume(), no call to play() from our code.
    const callsBefore = h.media.play.mock.calls.length;
    h.emitMedia('play');

    expect(h.adapter.snapshot().autoplayBlocked).toBe(false);
    expect(h.media.play).toHaveBeenCalledTimes(callsBefore);
  });

  it('clears the flag on `ended`, so it cannot suppress the real status line', async () => {
    // `statusLine` answers 'Finished.' for phase 'ended'. A stale flag outranks it in the
    // live region, so a finished replay would still be reading "press Play to start".
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);

    h.emitMedia('ended');

    expect(h.adapter.snapshot()).toMatchObject({ phase: 'ended', autoplayBlocked: false });
  });

  it('DETACHES every listener on stop(), counted rather than inferred', async () => {
    // My first version of this test dispatched `play` after stop() and asserted no new
    // snapshot. It could not fail: stop() has already set the flag false and `onPlay` returns
    // early on `stopped`, so nothing is published whether the listener was removed or not.
    // A surviving mutation said so. The listener SET is the observable thing, and the <video>
    // deliberately outlives every state change, so a listener left attached accumulates once
    // per open/close cycle for as long as the page lives.
    //
    // The TRANSIENT one is included deliberately. An independent check pointed out that this
    // test's title said "every listener" while its body counted three, and the fourth — the
    // `loadedmetadata` restore armed during a renewal — did survive teardown. So the renewal
    // is driven first, to arm it, before stop() is called.
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    h.media.currentTime = 600;
    await h.fire();                      // the renewal arms a `loadedmetadata` restore
    expect(h.listeners.loadedmetadata?.length ?? 0).toBe(1);
    expect(h.listeners.play?.length ?? 0).toBe(1);
    expect(h.listeners.error?.length ?? 0).toBe(1);
    expect(h.listeners.ended?.length ?? 0).toBe(1);

    h.adapter.stop();

    expect(h.listeners.loadedmetadata?.length ?? 0).toBe(0);
    expect(h.listeners.play?.length ?? 0).toBe(0);
    expect(h.listeners.error?.length ?? 0).toBe(0);
    expect(h.listeners.ended?.length ?? 0).toBe(0);
  });

  it('never calls play() on the src stop() just cleared', async () => {
    // What the surviving restore listener actually did: fire after teardown and ask a
    // credential-less element to play. It could not corrupt the snapshot — `blockPlayback`
    // guards on `stopped` — but asking a cleared element to play is a request that can only
    // fail, and it is the kind of thing that shows up in a console as an unexplained error.
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    h.media.currentTime = 600;
    await h.fire();
    h.adapter.stop();
    expect(h.media.src).toBe('');
    const callsAtStop = h.media.play.mock.calls.length;

    h.emitMedia('loadedmetadata');

    expect(h.media.play).toHaveBeenCalledTimes(callsAtStop);
  });

  it('a second renewal replaces the pending restore rather than stacking one', async () => {
    // Two pending restores would mean the OLDER `resumeAt` wins the second time
    // `loadedmetadata` fires, seeking the viewer backwards to where they were two renewals
    // ago. Only reachable if a renewal's metadata never arrives before the next one is due,
    // which is exactly what a stalled network looks like.
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    h.media.currentTime = 600;
    await h.fire();                      // first renewal: restore armed, metadata never fires
    h.media.currentTime = 1_200;
    await h.fire();                      // second renewal

    expect(h.listeners.loadedmetadata?.length ?? 0).toBe(1);
    h.emitMedia('loadedmetadata');
    // The LATER position, not the earlier one.
    expect(h.media.currentTime).toBe(1_200);
  });

  it('publishes NO snapshot when `play` fires and nothing was blocked', async () => {
    // Pins the `if (state.autoplayBlocked)` guard in `onPlay`. Removing it broke no test,
    // which an independent check flagged: the identical guard in `start()` IS pinned, so the
    // copy was being held to a weaker standard than its original. `play` fires on every
    // ordinary start and on every un-pause, so an unconditional emit is one extra `onChange`
    // — and therefore one extra React render — per event, on a component that is mounted for
    // the length of a ninety-minute replay. This workstream has already shipped one render
    // loop; a redundant render per media event is worth a test.
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(false);
    const published = h.snapshots.length;

    h.emitMedia('play');
    h.emitMedia('play');

    expect(h.snapshots.length).toBe(published);
  });

  it('drops the flag when a later renewal is DENIED, so it cannot outlive the media', async () => {
    // The sequence a surviving mutation (M13) exposed: autoplay is refused, the viewer has
    // not pressed Play yet, and meanwhile the replay is unpublished. The renewal comes back
    // 403 and `deny()` clears `media.src` — at which point a Play button would be an offer to
    // start something that no longer exists, sitting next to "you do not have access".
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);

    h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'not_watchable' } } });
    await h.fire();

    expect(h.adapter.snapshot()).toMatchObject({
      phase: 'denied', reason: 'not_watchable', autoplayBlocked: false,
    });
    expect(h.media.src).toBe('');
  });

  it('drops the flag when the recovery budget is spent', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(h.adapter.snapshot().autoplayBlocked).toBe(true);

    h.fetchGrant.mockRejectedValue({ response: { status: 503 } });
    for (let i = 0; i <= MAX_RECOVERY_ATTEMPTS; i += 1) {
      if (h.pending.length === 0) break;
      await h.fire();
    }

    expect(h.adapter.snapshot()).toMatchObject({ phase: 'failed', autoplayBlocked: false });
  });

  it('a refusal never reaches the caller as an unhandled rejection', async () => {
    const h = harness();
    h.media.play.mockRejectedValueOnce(refusal());
    h.fetchGrant.mockResolvedValue(grant());

    // acquire() is fire-and-forget from start(); an unhandled rejection inside it would
    // surface as a process-level warning in CI and as nothing at all in a browser.
    await expect((async () => { h.adapter.start(); await flush(); })()).resolves.toBeUndefined();
  });
});
