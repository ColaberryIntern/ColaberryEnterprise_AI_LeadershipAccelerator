import {
  decideAutoEnd, resolveAutoEndWindowMs, AUTO_END_BOUNDS, AUTO_END_WINDOW_ENV,
} from '../broadcastAutoEndPolicy';

/**
 * L7.4 — when a broadcast has been dead long enough to end itself.
 *
 * The assertion that matters most is the one about NOT ending. This rule can destroy a live
 * class in front of its audience, and every way it could do that wrongly is worth a named
 * test: a short disconnect, a class that never aired, and above all a provider we cannot
 * reach. A credential expiry must never read as "every class on the platform is over".
 */

const WINDOW = 5 * 60 * 1000;
const T0 = 1_780_000_000_000;

const at = (over: Partial<Parameters<typeof decideAutoEnd>[0]> = {}) => decideAutoEnd({
  state: 'live',
  observation: 'absent',
  goneSinceMs: null,
  nowMs: T0,
  windowMs: WINDOW,
  ...over,
});

describe('the stream is arriving', () => {
  it('never ends, and clears the clock rather than pausing it', () => {
    // Cleared, not kept: the window means CONTINUOUSLY gone, and a stream that came back for
    // even one observation has not been continuously gone. Keeping it would let a flapping
    // connection accumulate its way to an end.
    const r = at({ observation: 'live', goneSinceMs: T0 - WINDOW * 3 });

    expect(r.end).toBe(false);
    expect(r.goneSinceMs).toBeNull();
    expect(r.reason).toBe('stream_arriving');
  });
});

describe('a stream that has gone away', () => {
  it('starts the clock on the first absence and does not end on it', () => {
    const r = at({ goneSinceMs: null });

    expect(r.end).toBe(false);
    expect(r.goneSinceMs).toBe(T0);
    expect(r.goneForMs).toBe(0);
    expect(r.reason).toBe('within_window');
  });

  it('does NOT end a brief disconnect', () => {
    // Acceptance criterion 2. A presenter restarting OBS or switching scenes comes back to a
    // class that is still running.
    const r = at({ goneSinceMs: T0 - (WINDOW - 1000) });

    expect(r.end).toBe(false);
    expect(r.reason).toBe('within_window');
    expect(r.goneSinceMs).toBe(T0 - (WINDOW - 1000));
  });

  it('ends once the absence passes the window', () => {
    const r = at({ goneSinceMs: T0 - WINDOW });

    expect(r.end).toBe(true);
    expect(r.reason).toBe('gone_past_window');
    expect(r.goneForMs).toBe(WINDOW);
  });

  it('ends from reconnecting too, which is where a dead stream actually sits', () => {
    // By the time the window has passed, health has already moved the occurrence off `live`.
    // A rule that only fired from `live` would never fire at all.
    expect(at({ state: 'reconnecting', goneSinceMs: T0 - WINDOW * 2 }).end).toBe(true);
  });
});

describe('a provider we cannot reach', () => {
  it('NEVER ends a broadcast', () => {
    // The worst failure this feature could have: our token expires, every observation becomes
    // unreadable, and the safety net ends every live class at once. An end requires a positive
    // observation that the stream is absent.
    const r = at({ observation: 'unreadable', goneSinceMs: T0 - WINDOW * 10 });

    expect(r.end).toBe(false);
    expect(r.reason).toBe('cannot_confirm');
  });

  it('keeps the clock rather than resetting it, so flapping cannot buy infinite patience', () => {
    const r = at({ observation: 'unreadable', goneSinceMs: T0 - 60_000 });

    expect(r.goneSinceMs).toBe(T0 - 60_000);
    expect(r.goneForMs).toBe(60_000);
  });

  it('does not START a clock, because we have no evidence anything is wrong', () => {
    const r = at({ observation: 'unreadable', goneSinceMs: null });

    expect(r.goneSinceMs).toBeNull();
    expect(r.reason).toBe('cannot_confirm');
  });

  it('CONTROL: the same elapsed time DOES end when the absence is confirmed', () => {
    // Without this, the three assertions above could pass because nothing ever ends.
    expect(at({ observation: 'absent', goneSinceMs: T0 - WINDOW * 10 }).end).toBe(true);
  });
});

describe('an occurrence that is not on air', () => {
  it('never auto-ends a backstage occurrence', () => {
    // A class set up early has never aired. Auto-ending it would quietly destroy it, and the
    // producer would find a cancelled-looking class they never started.
    const r = at({ state: 'backstage', goneSinceMs: T0 - WINDOW * 5 });

    expect(r.end).toBe(false);
    expect(r.reason).toBe('not_on_air');
    expect(r.goneSinceMs).toBeNull();
  });
});

describe('the window is configurable', () => {
  // Acceptance criterion 5.
  it('defaults to five minutes when nothing is set', () => {
    expect(resolveAutoEndWindowMs({})).toBe(AUTO_END_BOUNDS.def * 1000);
  });

  it('takes an operator value', () => {
    expect(resolveAutoEndWindowMs({ [AUTO_END_WINDOW_ENV]: '600' })).toBe(600_000);
  });

  it('clamps a value that would end real classes during ordinary reconnects', () => {
    expect(resolveAutoEndWindowMs({ [AUTO_END_WINDOW_ENV]: '5' })).toBe(AUTO_END_BOUNDS.min * 1000);
  });

  it('clamps a value that would mean the safety net never fires', () => {
    expect(resolveAutoEndWindowMs({ [AUTO_END_WINDOW_ENV]: '999999' })).toBe(AUTO_END_BOUNDS.max * 1000);
  });

  it('falls back to the default on a typo rather than producing NaN', () => {
    // NaN survives every comparison as false, so a NaN window would silently disable the
    // safety net while every other test still passed.
    const ms = resolveAutoEndWindowMs({ [AUTO_END_WINDOW_ENV]: 'five minutes' });

    expect(Number.isFinite(ms)).toBe(true);
    expect(ms).toBe(AUTO_END_BOUNDS.def * 1000);
  });
});
