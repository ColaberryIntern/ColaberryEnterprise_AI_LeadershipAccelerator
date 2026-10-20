import { decideHealth, DEFAULT_MISS_THRESHOLD } from '../broadcastHealthPolicy';

/**
 * The health rule, argued with directly.
 *
 * The assertions that matter most are the ones where the right answer is to SAY NOTHING. A
 * single failed observation is not evidence a class has stopped, and reporting one would move
 * a live occurrence to `reconnecting` in front of its audience.
 */

describe('a stream that is arriving', () => {
  it('reports ready and forgets any previous misses', () => {
    expect(decideHealth('live', 'live', 5)).toEqual({
      report: 'ready', misses: 0, reason: 'stream_arriving',
    });
  });

  it('reports ready from backstage, which is what makes go_live possible at all', () => {
    // go_live is refused with ProviderNotReady until health is ready. Before this loop existed
    // that never happened on its own, and Test 2 had to be hand-fed the event.
    expect(decideHealth('live', 'backstage', 0).report).toBe('ready');
  });
});

describe('a backstage occurrence with no stream yet', () => {
  it('says nothing, however long it waits', () => {
    // Early is not broken. A class set up the night before must not log a fault every minute
    // until its presenter opens Zoom, or the signal that matters gets ignored.
    let misses = 0;
    for (let i = 0; i < 10; i += 1) {
      const d = decideHealth('absent', 'backstage', misses);
      expect(d.report).toBeNull();
      expect(d.reason).toBe('not_started_yet');
      misses = d.misses;
    }
    expect(misses).toBe(10);
  });
});

describe('a live stream that stops', () => {
  it('HOLDS on the first miss rather than reacting to a blip', () => {
    const d = decideHealth('absent', 'live', 0);
    expect(d.report).toBeNull();
    expect(d.reason).toBe('holding_for_confirmation');
    expect(d.misses).toBe(1);
  });

  it('reports down once the miss repeats', () => {
    const first = decideHealth('absent', 'live', 0);
    const second = decideHealth('absent', 'live', first.misses);
    expect(second.report).toBe('down');
    expect(second.reason).toBe('stream_gone');
  });

  it('recovers to ready the moment the stream returns, without waiting', () => {
    const gone = decideHealth('absent', 'live', 1);
    expect(gone.report).toBe('down');
    const back = decideHealth('live', 'reconnecting', gone.misses);
    expect(back).toEqual({ report: 'ready', misses: 0, reason: 'stream_arriving' });
  });

  it('honours a threshold of one when an operator wants no patience at all', () => {
    expect(decideHealth('absent', 'live', 0, 1).report).toBe('down');
  });

  it('holds longer when the threshold is raised', () => {
    expect(decideHealth('absent', 'live', 1, 4).report).toBeNull();
    expect(decideHealth('absent', 'live', 3, 4).report).toBe('down');
  });
});

describe('a provider we cannot reach', () => {
  it('holds first, exactly like a missing stream', () => {
    expect(decideHealth('unreadable', 'live', 0).report).toBeNull();
  });

  it('reports DEGRADED, not down — we did not observe the stream stop', () => {
    // Both values move a live occurrence to reconnecting, so the operational effect matches.
    // The distinction is for the person reading the row afterwards: "the stream is gone" and
    // "we could not see the provider" are different facts and should not be recorded as one.
    const d = decideHealth('unreadable', 'live', 1);
    expect(d.report).toBe('degraded');
    expect(d.reason).toBe('provider_unreadable');
  });

  it('never reports down for an unreadable provider, at any miss count', () => {
    for (const m of [1, 2, 5, 50]) {
      expect(decideHealth('unreadable', 'live', m).report).not.toBe('down');
    }
  });
});

describe('the default threshold', () => {
  it('is two, so one blip is never acted on', () => {
    expect(DEFAULT_MISS_THRESHOLD).toBe(2);
    expect(decideHealth('absent', 'live', 0).report).toBeNull();
  });
});
