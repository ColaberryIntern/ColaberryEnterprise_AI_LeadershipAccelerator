import {
  createPlaybackAdapter,
  redactMediaUrl,
  MAX_RECOVERY_ATTEMPTS,
  PlaybackSnapshot,
} from '../broadcastPlaybackAdapter';
import {
  harness, grant, flush, refusal, OCC, ASSET, T0, SIG,
} from '../testSupport/broadcastPlaybackHarness';

/**
 * THE RULE THAT SHAPES THE ADAPTER'S ERROR HANDLING, on its own because it is a property of
 * every state rather than of one path: a signed URL must never reach an error surface. It
 * carries an HMAC granting access to paid content for its remaining lifetime, and an error
 * surface is the one place a URL reliably gets copied into a bug report, a log aggregator or
 * a screenshot.
 *
 * Split out of `broadcastPlaybackAdapter.test.ts` when that file passed the 500-line ceiling.
 * A MOVE: no assertion here was changed.
 */

describe('no signed URL reaches any error surface', () => {
  /** Every scenario that produces an error state, swept for the signature. */
  it('the sweep below would actually catch a leak', () => {
    // Without this, the sweep passes if the pattern is wrong, which is most of how a
    // check like it fails silently.
    const leaky = `broadcast_playback_failed url=/bm/broadcast/x/y.mp4?e=${T0}&s=${SIG}`;
    expect(leaky).toContain(SIG);
    expect(leaky).toMatch(/[?&]s=(?!<redacted>)/);
    expect(leaky).toMatch(/[?&]e=(?!<redacted>)/);
    // And the redacted form must survive it.
    expect(redactMediaUrl(leaky)).not.toMatch(/[?&]s=(?!<redacted>)/);
  });

  it('never puts the signature in a snapshot or a log line, in any failure mode', async () => {
    const scenarios: Array<() => Promise<ReturnType<typeof harness>>> = [
      async () => {   // denied
        const h = harness();
        h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'preview_expired' } } });
        h.adapter.start();
        await flush();
        return h;
      },
      async () => {   // exhausted
        const h = harness();
        h.fetchGrant.mockRejectedValue(new Error('Network Error'));
        h.adapter.start();
        await flush();
        for (let i = 0; i < MAX_RECOVERY_ATTEMPTS; i += 1) await h.fire();
        return h;
      },
      async () => {   // media error after a successful acquisition
        const h = harness();
        h.fetchGrant.mockResolvedValue(grant());
        h.adapter.start();
        await flush();
        h.advanceTo(T0 + 121_000);
        h.emitMedia('error');
        return h;
      },
      async () => {   // preview closing mid-playback
        const h = harness();
        h.fetchGrant.mockResolvedValue(grant({ grant: 'preview', preview_seconds_remaining: 30 }));
        h.adapter.start();
        await flush();
        h.fetchGrant.mockRejectedValue({ response: { status: 403, data: { reason: 'preview_expired' } } });
        await h.fire();
        return h;
      },
    ];

    for (const scenario of scenarios) {
      const h = await scenario();
      const everything = JSON.stringify(h.snapshots) + '\n' + h.logs.join('\n');
      // WHAT IS SECRET HERE, precisely. It took three wrong versions of this assertion
      // to say it properly. The signature is the secret: it is what grants access. The
      // key path is not (it names an asset and grants nothing without an `s`), and the
      // expiry is not either - `credentialExpiresAt` is a deliberate snapshot field,
      // because the UI needs it to show a countdown and the adapter needs it to schedule
      // renewal. Earlier versions forbade a bare 's=' (which matches the word
      // "attempts=4"), then '/bm/' and the expiry value, both of which contradicted the
      // design this file is supposed to be checking. Assert the secret, not the shape.
      expect(everything).not.toContain(SIG);
      expect(everything).not.toMatch(/[?&]s=(?!<redacted>)/);
      expect(everything).not.toMatch(/[?&]e=(?!<redacted>)/);
    }
  });

  it('redacts the url even on the SUCCESS log line, where it is most tempting to keep', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();

    const acquired = h.logs.find((l) => l.includes('broadcast_playback_acquired'));
    expect(acquired).toBeDefined();
    expect(acquired).toContain('<redacted>');
    expect(acquired).not.toContain(SIG);
  });

  it('carries no url field on the snapshot at all — it cannot leak what it does not hold', async () => {
    const h = harness();
    h.fetchGrant.mockResolvedValue(grant());
    h.adapter.start();
    await flush();
    expect(Object.keys(h.adapter.snapshot()).sort()).toEqual([
      'attempt', 'autoplayBlocked', 'credentialExpiresAt', 'offerUpgrade', 'phase',
      'previewSecondsRemaining', 'reason',
    ]);
  });
});
