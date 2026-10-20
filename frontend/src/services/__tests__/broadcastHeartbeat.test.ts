import {
  createPlaybackHeartbeat,
  newSessionId,
  DEFAULT_HEARTBEAT_MS,
  HeartbeatBody,
} from '../broadcastHeartbeat';

/**
 * The heartbeat module's own rules, with injected time so nothing waits on a real clock.
 *
 * The companion suite (liveMiniPlayer.heartbeat.test.tsx) proves the PLAYER calls this. Both
 * halves are needed: L4.6 had thirteen tests of the server half and shipped with no caller, so
 * a module tested in isolation is not evidence that anything uses it.
 */

const SERVER_SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** A controllable interval, so "15 seconds later" is a function call. */
function fakeTimers() {
  let fn: (() => void) | null = null;
  let ms: number | null = null;
  return {
    setTimer: (f: () => void, m: number) => { fn = f; ms = m; return 'handle'; },
    clearTimer: () => { fn = null; ms = null; },
    tick: () => { if (fn) fn(); },
    get running() { return fn !== null; },
    get intervalMs() { return ms; },
  };
}

function harness(opts: { hidden?: boolean } = {}) {
  const posted: HeartbeatBody[] = [];
  const timers = fakeTimers();
  const beat = createPlaybackHeartbeat({
    post: async (body) => { posted.push(body); },
    sessionId: 'test-session-abcdefgh',
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    isHidden: () => opts.hidden === true,
  });
  return { beat, posted, timers };
}

describe('newSessionId', () => {
  it('satisfies the server pattern', () => {
    expect(newSessionId()).toMatch(SERVER_SESSION_ID);
  });

  it('is different every time, so two tabs are two sessions', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()));
    expect(ids.size).toBe(50);
  });
});

describe('reporting state', () => {
  it('posts on the first report', async () => {
    const { beat, posted } = harness();
    beat.report('playing');
    await Promise.resolve();
    expect(posted).toEqual([{ session_id: 'test-session-abcdefgh', state: 'playing', intent: 'deliberate' }]);
  });

  it('posts each CHANGE but not a repeat', async () => {
    const { beat, posted } = harness();
    beat.report('playing');
    beat.report('playing');
    beat.report('paused');
    beat.report('paused');
    await Promise.resolve();
    expect(posted.map((p) => p.state)).toEqual(['playing', 'paused']);
  });

  it('beats on an interval while playing, at the server cadence', async () => {
    const { beat, posted, timers } = harness();
    beat.report('playing');
    await Promise.resolve();
    expect(timers.running).toBe(true);
    expect(timers.intervalMs).toBe(DEFAULT_HEARTBEAT_MS);

    timers.tick();
    timers.tick();
    await Promise.resolve();

    expect(posted.map((p) => p.state)).toEqual(['playing', 'playing', 'playing']);
    // A periodic beat is not a user action, and the server records the difference.
    expect(posted.slice(1).every((p) => p.intent === 'auto')).toBe(true);
  });

  it('stops beating when playback stops', async () => {
    const { beat, timers } = harness();
    beat.report('playing');
    expect(timers.running).toBe(true);
    beat.report('paused');
    expect(timers.running).toBe(false);
  });

  it('does not beat while the tab is hidden, even though the element is still playing', async () => {
    // A backgrounded tab keeps a <video> playing. Counting it inflates the audience with
    // people who are not in the room.
    const { beat, posted, timers } = harness({ hidden: true });
    beat.report('playing');
    await Promise.resolve();
    const afterFirst = posted.length;

    timers.tick();
    timers.tick();
    await Promise.resolve();

    expect(posted.length).toBe(afterFirst);
  });
});

describe('stop', () => {
  it('sends a final ended beat and clears the interval', async () => {
    const { beat, posted, timers } = harness();
    beat.report('playing');
    beat.stop();
    await Promise.resolve();
    expect(timers.running).toBe(false);
    expect(posted[posted.length - 1].state).toBe('ended');
  });

  it('is idempotent and silent after stopping', async () => {
    const { beat, posted } = harness();
    beat.report('playing');
    beat.stop();
    await Promise.resolve();
    const after = posted.length;

    beat.stop();
    beat.report('playing');
    await Promise.resolve();

    expect(posted.length).toBe(after);
  });

  it('does not send an ended beat if nothing ever played', async () => {
    const { beat, posted } = harness();
    beat.stop();
    await Promise.resolve();
    expect(posted).toEqual([]);
  });
});

describe('failure is never the caller\'s problem', () => {
  it('swallows a rejected post and keeps beating', async () => {
    const posted: string[] = [];
    const timers = fakeTimers();
    const log: string[] = [];
    const beat = createPlaybackHeartbeat({
      post: async (b) => { posted.push(b.state); throw new Error('collector down'); },
      sessionId: 'test-session-abcdefgh',
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      isHidden: () => false,
      log: (l) => log.push(l),
    });

    expect(() => beat.report('playing')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    timers.tick();
    await Promise.resolve();
    await Promise.resolve();

    expect(posted.length).toBeGreaterThanOrEqual(2);
    expect(log.some((l) => /failed/.test(l))).toBe(true);
  });

  it('does not throw when post throws synchronously', async () => {
    const beat = createPlaybackHeartbeat({
      post: () => { throw new Error('exploded before the promise'); },
      sessionId: 'test-session-abcdefgh',
      setTimer: () => 'h',
      clearTimer: () => undefined,
      isHidden: () => false,
    });
    expect(() => beat.report('playing')).not.toThrow();
    await Promise.resolve();
  });
});
