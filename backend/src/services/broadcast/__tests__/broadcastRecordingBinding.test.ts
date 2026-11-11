import {
  decideRecordingBinding, resolvePlaybackTarget,
  type BindableOccurrence, type LifecycleObservation,
} from '../broadcastRecordingBinding';

/**
 * L8.4 — which recording belongs to which occurrence, and what gets signed for playback.
 *
 * The assertion that matters most is that an ENDED occurrence never signs its live input.
 * That is the defect this ticket exists to fix, it is the behaviour the code shipped with,
 * and it is invisible from the outside: the url is well-formed, correctly signed, correctly
 * expiring, and points at an input nobody is streaming to.
 */

const VIDEO = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const OTHER = 'ffffffffffffffffffffffffffffffff';
const INPUT = 'ed843de347601f51d2ae57374a645b8a';

const occ = (over: Partial<BindableOccurrence> = {}): BindableOccurrence => ({
  id: 'occ-1', editorial_state: 'live', provider: 'cloudflare', provider_instance_uuid: null, ...over,
});
const seen = (over: Partial<LifecycleObservation> = {}): LifecycleObservation => ({
  live: true, videoUid: VIDEO, ...over,
});

describe('capturing the recording while the show is on air', () => {
  it('captures the video uid the first time it is seen', () => {
    const d = decideRecordingBinding(occ(), seen());

    expect(d).toEqual({ capture: VIDEO, reason: 'captured' });
  });

  it('does nothing on every later tick, so a 40-minute class writes once', () => {
    const d = decideRecordingBinding(occ({ provider_instance_uuid: VIDEO }), seen());

    expect(d).toEqual({ capture: null, reason: 'already_bound' });
  });

  it('captures nothing while the input is idle', () => {
    expect(decideRecordingBinding(occ(), seen({ live: false, videoUid: null })).reason)
      .toBe('no_video_yet');
  });

  it('refuses a malformed uid rather than writing one that would sign nonsense', () => {
    // A playback token carries the uid in `sub`. Persisting rubbish produces a signed url that
    // fails at the player, which looks like a broken recording rather than a bad write.
    for (const bad of ['', 'not-a-uid', VIDEO.toUpperCase(), VIDEO.slice(0, 31), `${VIDEO}0`]) {
      expect(decideRecordingBinding(occ(), seen({ videoUid: bad })).capture).toBeNull();
    }
  });

  it('CONTROL: a well-formed uid IS captured', () => {
    // Without this, the refusals above could be a function that never captures anything.
    expect(decideRecordingBinding(occ(), seen({ videoUid: OTHER })).capture).toBe(OTHER);
  });

  it('REFUSES to overwrite a binding with a different video', () => {
    // Cloudflare mints a new video per broadcast, so a second uid means the input streamed
    // twice under one occurrence. Overwriting would discard the recording the audience
    // actually watched and leave the replay on whichever stretch happened to be last.
    const d = decideRecordingBinding(occ({ provider_instance_uuid: VIDEO }), seen({ videoUid: OTHER }));

    expect(d).toEqual({ capture: null, reason: 'conflict' });
  });

  it('ignores an occurrence that is not on Cloudflare', () => {
    expect(decideRecordingBinding(occ({ provider: 'zoom' }), seen()).reason).toBe('not_cloudflare');
  });
});

/**
 * A REHEARSAL MUST NOT BECOME THE PUBLISHED REPLAY.
 *
 * This is the one case where every individual piece was correct and documented, and the
 * combination was still wrong - so it is asserted as the scenario, not only as the branch.
 *
 *   - the health loop observes `backstage` on purpose: entering it is what starts the watch
 *     for a feed (broadcastHealthRunner.ts:29),
 *   - the live input records with `mode: 'automatic'` (cloudflareStreamProvider.ts:310), so
 *     Cloudflare records a rehearsal whatever our editorial state says,
 *   - the first uid seen was bound, in any observed state,
 *   - and a later, different uid is refused as a `conflict` rather than replacing it.
 *
 * So the rehearsal was bound and the real class was refused.
 */
describe('a rehearsal is not the replay', () => {
  const REHEARSAL = '11111111111111111111111111111111';
  const CLASS = '22222222222222222222222222222222';

  it('captures nothing while the occurrence is backstage, even with a recording running', () => {
    const d = decideRecordingBinding(occ({ editorial_state: 'backstage' }), seen());

    expect(d).toEqual({ capture: null, reason: 'not_on_air' });
  });

  it('captures nothing for a scheduled occurrence either', () => {
    // Reachable: a producer can push to the input before touching the controls at all.
    expect(decideRecordingBinding(occ({ editorial_state: 'scheduled' }), seen()).reason)
      .toBe('not_on_air');
  });

  /**
   * THE FULL SCENARIO, as it would happen in the room. Asserting only `not_on_air` would
   * leave the actual consequence untested, and the consequence is what a student sees.
   */
  it('binds the CLASS, not the rehearsal, when OBS is stopped and restarted between them', () => {
    // 1. Backstage. The producer starts OBS to check the feed. Cloudflare records it.
    const backstage = decideRecordingBinding(
      occ({ editorial_state: 'backstage', provider_instance_uuid: null }),
      seen({ videoUid: REHEARSAL }),
    );
    expect(backstage.capture).toBeNull();

    // 2. OBS is stopped, the class starts, and Cloudflare mints a new video for it. Because
    //    step 1 wrote nothing, this is a first sighting rather than a refused conflict.
    const onAir = decideRecordingBinding(
      occ({ editorial_state: 'live', provider_instance_uuid: backstage.capture }),
      seen({ videoUid: CLASS }),
    );

    expect(onAir).toEqual({ capture: CLASS, reason: 'captured' });

    // 3. The replay therefore plays the class. This is the assertion the defect would fail:
    //    before the guard, the occurrence ended bound to REHEARSAL.
    expect(resolvePlaybackTarget({
      editorial_state: 'replay_ready',
      provider_session_id: INPUT,
      provider_instance_uuid: onAir.capture,
    })).toEqual({ kind: 'replay', uid: CLASS });
  });

  it('costs nothing when OBS pushes straight through from backstage into live', () => {
    // Cloudflare mints one video per continuous RTMP connection, not per editorial state, so
    // the uid seen backstage is the same one seen on air. Skipping the backstage ticks delays
    // the write by a tick and binds the identical video.
    const SAME = REHEARSAL;
    expect(decideRecordingBinding(occ({ editorial_state: 'backstage' }), seen({ videoUid: SAME })).capture)
      .toBeNull();
    expect(decideRecordingBinding(occ({ editorial_state: 'live' }), seen({ videoUid: SAME })))
      .toEqual({ capture: SAME, reason: 'captured' });
  });

  it('still captures on the tick that ends the show, which is the last chance to see the uid', () => {
    // The runner decides the binding BEFORE the health decision, so the occurrence is still
    // `live` on that tick. If this guard had been placed after it, a show whose stream dropped
    // would end with no replay at all.
    expect(decideRecordingBinding(occ({ editorial_state: 'reconnecting' }), seen()))
      .toEqual({ capture: VIDEO, reason: 'captured' });
  });

  it('CONTROL: the guard reads the state, and has not just turned capturing off', () => {
    expect(decideRecordingBinding(occ({ editorial_state: 'live' }), seen()).reason).toBe('captured');
  });
});

describe('what gets signed for playback', () => {
  const target = (over: Record<string, unknown> = {}) => resolvePlaybackTarget({
    editorial_state: 'ended', provider_session_id: INPUT, provider_instance_uuid: VIDEO, ...over,
  });

  it('an ENDED occurrence signs its RECORDING, never its live input', () => {
    // The defect. Shipped behaviour signed `provider_session_id` unconditionally, so a replay
    // grant for Test 2 returned a live manifest for an input that stopped days earlier.
    const t = target();

    expect(t).toEqual({ kind: 'replay', uid: VIDEO });
    expect(t).not.toEqual(expect.objectContaining({ uid: INPUT }));
  });

  it('a LIVE occurrence signs its live input', () => {
    expect(target({ editorial_state: 'live' })).toEqual({ kind: 'live', uid: INPUT });
  });

  it('treats reconnecting as still on air', () => {
    // A thirty-second blip must not switch a viewer to a recording that does not exist yet.
    expect(target({ editorial_state: 'reconnecting' })).toEqual({ kind: 'live', uid: INPUT });
  });

  it('says recording_not_bound rather than falling back to the live input', () => {
    // Absence must be distinguishable from breakage, and the fallback is the bug.
    expect(target({ provider_instance_uuid: null }))
      .toEqual({ kind: 'none', reason: 'recording_not_bound' });
  });

  it('says live_input_not_bound while on air with nothing configured', () => {
    expect(target({ editorial_state: 'live', provider_session_id: null }))
      .toEqual({ kind: 'none', reason: 'live_input_not_bound' });
  });

  it('a scheduled or backstage occurrence offers no live url', () => {
    // These would otherwise fall to the live branch and hand over a manifest for an input
    // nobody is streaming to.
    for (const state of ['scheduled', 'backstage']) {
      expect(target({ editorial_state: state, provider_instance_uuid: null }))
        .toEqual({ kind: 'none', reason: 'recording_not_bound' });
    }
  });

  it('the replay states all resolve to the recording', () => {
    for (const state of ['ended', 'processing', 'replay_ready']) {
      expect(target({ editorial_state: state })).toEqual({ kind: 'replay', uid: VIDEO });
    }
  });
});
