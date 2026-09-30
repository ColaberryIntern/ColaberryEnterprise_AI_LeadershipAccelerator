import { checkCaps, resolveCaps, DEFAULT_CAPS, CapLimits, SentReply } from '../replyCaps';

/**
 * Each ceiling must actually block, and must block for its OWN reason. A single
 * test that "some cap blocked" would pass with two of the three ceilings
 * removed, so every case here asserts which ceiling fired, the count it saw and
 * the limit it enforced.
 */

const CAPS: CapLimits = { perThread: 1, perRecipient: 2, total: 3 };

const reply = (threadKey: string, recipient: string): SentReply => ({ threadKey, recipient });

describe('defaults', () => {
  it('are one per thread, two per recipient, fifteen in total', () => {
    expect(DEFAULT_CAPS).toEqual({ perThread: 1, perRecipient: 2, total: 15 });
  });
});

describe('the per-thread ceiling', () => {
  it('allows the first reply on a thread', () => {
    const verdict = checkCaps([], { threadKey: 't1', recipient: 'a@x.com' }, CAPS);
    expect(verdict).toEqual({ blocked: false });
  });

  it('blocks a second reply on the same thread', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com')],
      { threadKey: 't1', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: true, cap: 'per_thread', observed: 1, limit: 1 });
  });

  it('does not block a different thread from the same person', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com')],
      { threadKey: 't2', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: false });
  });
});

describe('the per-recipient ceiling', () => {
  it('blocks a third thread from the same person once two replies have gone', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'a@x.com')],
      { threadKey: 't3', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: true, cap: 'per_recipient', observed: 2, limit: 2 });
  });

  it('counts the same person across case and display-name differences', () => {
    const verdict = checkCaps(
      [reply('t1', 'A@X.com'), reply('t2', '  a@x.com  ')],
      { threadKey: 't3', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: true, cap: 'per_recipient', observed: 2, limit: 2 });
  });

  it('does not block a different person', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'a@x.com')],
      { threadKey: 't3', recipient: 'b@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: false });
  });
});

describe('the total ceiling', () => {
  it('blocks a new person once the window total is reached', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'b@x.com'), reply('t3', 'c@x.com')],
      { threadKey: 't4', recipient: 'd@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: true, cap: 'total', observed: 3, limit: 3 });
  });

  it('allows the reply that brings the total exactly to the limit', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'b@x.com')],
      { threadKey: 't3', recipient: 'c@x.com' },
      CAPS,
    );
    expect(verdict).toEqual({ blocked: false });
  });
});

describe('ceilings are reported tightest-first', () => {
  it('names per_thread when the thread, the recipient and the total are all breached', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'a@x.com'), reply('t3', 'b@x.com')],
      { threadKey: 't1', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict.cap).toBe('per_thread');
  });

  it('names per_recipient when the recipient and the total are breached but the thread is new', () => {
    const verdict = checkCaps(
      [reply('t1', 'a@x.com'), reply('t2', 'a@x.com'), reply('t3', 'b@x.com')],
      { threadKey: 't9', recipient: 'a@x.com' },
      CAPS,
    );
    expect(verdict.cap).toBe('per_recipient');
  });
});

describe('resolveCaps', () => {
  it('uses the defaults when nothing is set', () => {
    expect(resolveCaps({} as NodeJS.ProcessEnv)).toEqual(DEFAULT_CAPS);
  });

  it('reads integer overrides', () => {
    const caps = resolveCaps({
      WATCHER_MAX_REPLIES_PER_THREAD: '2',
      WATCHER_MAX_REPLIES_PER_RECIPIENT: '4',
      WATCHER_MAX_REPLIES_TOTAL: '9',
    } as NodeJS.ProcessEnv);
    expect(caps).toEqual({ perThread: 2, perRecipient: 4, total: 9 });
  });

  it('refuses a non-numeric ceiling instead of coercing it to NaN and disabling the cap', () => {
    expect(() =>
      resolveCaps({ WATCHER_MAX_REPLIES_TOTAL: 'lots' } as NodeJS.ProcessEnv),
    ).toThrow(/not a non-negative integer/);
  });

  it('refuses a negative ceiling', () => {
    expect(() =>
      resolveCaps({ WATCHER_MAX_REPLIES_PER_THREAD: '-1' } as NodeJS.ProcessEnv),
    ).toThrow(/not a non-negative integer/);
  });

  it('accepts zero, which blocks everything', () => {
    const caps = resolveCaps({ WATCHER_MAX_REPLIES_TOTAL: '0' } as NodeJS.ProcessEnv);
    expect(caps.total).toBe(0);
    expect(checkCaps([], { threadKey: 't1', recipient: 'a@x.com' }, caps)).toEqual({
      blocked: true, cap: 'total', observed: 0, limit: 0,
    });
  });
});
