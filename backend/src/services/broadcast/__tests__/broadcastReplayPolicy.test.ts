import {
  decideReplayPromotion, narrowRecordingState, PROMOTABLE_STATES,
  type RecordingState,
} from '../broadcastReplayPolicy';

/**
 * L8.4 — when a finished broadcast becomes a watchable replay.
 *
 * The assertions worth the most are the ones about NOT publishing. `replay_ready` with nothing
 * bound is an occurrence that advertises a replay and then refuses to play it, which is worse
 * than staying honestly ended — and it is exactly what a well-meaning "promote everything that
 * finished" rule would produce.
 */

const cand = (state: string, uid: string | null = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6') => ({
  editorial_state: state, provider_instance_uuid: uid,
});

describe('reading Cloudflare’s vocabulary', () => {
  it('maps the states it documents', () => {
    expect(narrowRecordingState('ready')).toBe('ready');
    expect(narrowRecordingState('error')).toBe('error');
    for (const s of ['inprogress', 'queued', 'pendingupload', 'downloading']) {
      expect(narrowRecordingState(s)).toBe('preparing');
    }
  });

  it('is not case-sensitive, because the provider is not consistent about it', () => {
    expect(narrowRecordingState('Ready')).toBe('ready');
  });

  it('treats an unknown value as unreadable, NOT as still preparing', () => {
    // A future Cloudflare state silently read as "working on it" would stall every replay for
    // ever with nothing in the logs to say why.
    for (const s of [undefined, null, '', 'brand-new-state', 42]) {
      expect(narrowRecordingState(s)).toBe('unreadable');
    }
  });
});

describe('publishing a replay', () => {
  it('moves a finished show into processing once its recording is ready', () => {
    expect(decideReplayPromotion(cand('ended'), 'ready'))
      .toEqual({ command: 'begin_processing', reason: 'recording_ready' });
  });

  it('publishes from processing', () => {
    expect(decideReplayPromotion(cand('processing'), 'ready'))
      .toEqual({ command: 'publish_replay', reason: 'recording_ready' });
  });

  it('never jumps straight from ended to replay_ready', () => {
    // The transition table forbids it, and a policy that proposed it would be relying on a
    // downstream refusal to save it.
    expect(decideReplayPromotion(cand('ended'), 'ready').command).not.toBe('publish_replay');
  });

  it('moves into processing while the recording is still being produced', () => {
    expect(decideReplayPromotion(cand('ended'), 'preparing'))
      .toEqual({ command: 'begin_processing', reason: 'recording_preparing' });
  });

  it('waits in processing until the recording is ready', () => {
    expect(decideReplayPromotion(cand('processing'), 'preparing'))
      .toEqual({ command: null, reason: 'recording_preparing' });
  });
});

describe('what must never be published', () => {
  it('a show with no recording bound', () => {
    // The one that matters. `replay_ready` with nothing bound advertises a replay and then
    // refuses to play it.
    for (const state of ['ended', 'processing']) {
      expect(decideReplayPromotion(cand(state, null), 'ready'))
        .toEqual({ command: null, reason: 'no_recording' });
    }
  });

  it('a recording Cloudflare failed to produce', () => {
    // `ended` is the truthful terminal state for a show with no replay: it aired, and there is
    // nothing to watch.
    expect(decideReplayPromotion(cand('ended'), 'error'))
      .toEqual({ command: null, reason: 'recording_failed' });
  });

  it('anything we could not confirm', () => {
    // Our failure to ask is never a fact about the recording.
    expect(decideReplayPromotion(cand('processing'), 'unreadable'))
      .toEqual({ command: null, reason: 'cannot_confirm' });
  });

  it('a show that is still on air, or never aired', () => {
    for (const state of ['scheduled', 'backstage', 'live', 'reconnecting', 'cancelled', 'replay_ready']) {
      expect(decideReplayPromotion(cand(state), 'ready'))
        .toEqual({ command: null, reason: 'not_a_candidate' });
    }
  });

  it('CONTROL: the promotable states DO produce a command', () => {
    // Without this, every refusal above could be a function that never promotes anything.
    PROMOTABLE_STATES.forEach((state) => {
      expect(decideReplayPromotion(cand(state), 'ready').command).not.toBeNull();
    });
  });
});

describe('it is safe to run every minute', () => {
  it('a published replay is left alone', () => {
    expect(decideReplayPromotion(cand('replay_ready'), 'ready').command).toBeNull();
  });

  it('each tick moves at most one step', () => {
    // ended -> processing -> replay_ready, never both at once. That is what makes a repeated
    // evaluation idempotent rather than racing itself.
    const first = decideReplayPromotion(cand('ended'), 'ready');
    expect(first.command).toBe('begin_processing');
    const second = decideReplayPromotion(cand('processing'), 'ready');
    expect(second.command).toBe('publish_replay');
    const third = decideReplayPromotion(cand('replay_ready'), 'ready');
    expect(third.command).toBeNull();
  });

  it('every RecordingState is handled, with no silent fallthrough', () => {
    const states: RecordingState[] = ['preparing', 'ready', 'error', 'unreadable'];
    states.forEach((s) => {
      const d = decideReplayPromotion(cand('ended'), s);
      expect(d.reason).not.toBe('not_a_candidate');
      expect(typeof d.reason).toBe('string');
    });
  });
});
