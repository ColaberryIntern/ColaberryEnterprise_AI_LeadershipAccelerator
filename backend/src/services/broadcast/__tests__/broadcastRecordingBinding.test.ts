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
