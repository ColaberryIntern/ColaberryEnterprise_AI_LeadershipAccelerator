import {
  accumulateWatch,
  isWatchableCard,
  requiredWatchPct,
  meetsWatchRequirement,
  withAuthoritativeDuration,
  DEFAULT_WATCH_PCT,
  MAX_DELTA_PER_BEAT_S,
  WatchState,
} from '../watchProgressMath';

const NOW = '2026-07-16T00:00:00.000Z';

describe('accumulateWatch', () => {
  it('accumulates play time and derives percentage from duration', () => {
    let s = accumulateWatch(null, { delta_s: 10, position_s: 10, duration_s: 100 }, NOW);
    expect(s.watched_s).toBe(10);
    expect(s.duration_s).toBe(100);
    expect(s.watched_pct).toBe(10);
    s = accumulateWatch(s, { delta_s: 10, position_s: 20, duration_s: 100 }, NOW);
    expect(s.watched_s).toBe(20);
    expect(s.watched_pct).toBe(20);
  });

  it('clamps a single beat delta to the per-beat ceiling (anti-scrub / anti-forge)', () => {
    const s = accumulateWatch(null, { delta_s: 9999, position_s: 9999, duration_s: 100 }, NOW);
    expect(s.watched_s).toBe(MAX_DELTA_PER_BEAT_S);   // 45, not 9999
  });

  it('ignores negative / NaN deltas (never rewinds watched time)', () => {
    const base = accumulateWatch(null, { delta_s: 30, position_s: 30, duration_s: 100 }, NOW);
    const after = accumulateWatch(base, { delta_s: -50, position_s: 5, duration_s: 100 }, NOW);
    expect(after.watched_s).toBe(30);                 // unchanged
    expect(after.max_position_s).toBe(30);            // position ratchets, never drops
    const nan = accumulateWatch(base, { delta_s: NaN as any, position_s: 40, duration_s: 100 }, NOW);
    expect(nan.watched_s).toBe(30);
  });

  it('ratchets duration to the largest reported value', () => {
    let s = accumulateWatch(null, { delta_s: 5, position_s: 5, duration_s: 100 }, NOW);
    s = accumulateWatch(s, { delta_s: 5, position_s: 10, duration_s: 40 }, NOW);   // smaller — ignored
    expect(s.duration_s).toBe(100);
  });

  it('caps accumulated time at 2x duration and percentage at 100', () => {
    let s: WatchState | null = null;
    for (let i = 0; i < 20; i++) s = accumulateWatch(s, { delta_s: 45, position_s: 45 * (i + 1), duration_s: 60 }, NOW);
    expect(s!.watched_s).toBeLessThanOrEqual(120);    // 2 * 60
    expect(s!.watched_pct).toBe(100);
  });

  it('leaves percentage at 0 while duration is unknown', () => {
    const s = accumulateWatch(null, { delta_s: 20, position_s: 20 }, NOW);
    expect(s.duration_s).toBe(0);
    expect(s.watched_pct).toBe(0);
    expect(s.watched_s).toBe(20);
  });

  it('omitting authoritativeDurationS preserves the exact existing ratchet behavior (regression guard)', () => {
    let s = accumulateWatch(null, { delta_s: 5, position_s: 5, duration_s: 100 }, NOW);
    s = accumulateWatch(s, { delta_s: 5, position_s: 10, duration_s: 40 }, NOW); // smaller — ignored, same as the pre-fix test above
    expect(s.duration_s).toBe(100);
  });
});

describe('accumulateWatch with an authoritative duration', () => {
  it('is used from the very first beat — no ratchet warm-up needed', () => {
    const s = accumulateWatch(null, { delta_s: 10, position_s: 10, duration_s: 600 }, NOW, 300);
    expect(s.duration_s).toBe(300);          // authoritative wins outright, not the inflated client value
    expect(s.watched_pct).toBe(3);           // 10/300, not 10/600
  });

  it('a smaller authoritative duration overrides a stale/poisoned larger ratcheted value', () => {
    // Simulate a card already poisoned by the pre-fix bug: an inflated fallback (600s)
    // was locked in via the old ratchet.
    let s = accumulateWatch(null, { delta_s: 45, position_s: 45, duration_s: 600 }, NOW);
    expect(s.duration_s).toBe(600); // poisoned, exactly as the bug described

    // Ground truth (300s) becomes known on the next beat — must win immediately, not
    // be capped by Math.max(600, 300) (which would keep the poisoned 600 forever).
    s = accumulateWatch(s, { delta_s: 45, position_s: 90 }, NOW, 300);
    expect(s.duration_s).toBe(300);
    expect(s.watched_pct).toBe(30); // 90/300, judged against the true duration, not 600
  });

  it('ignores a non-finite/zero/negative authoritative value and falls back to the ratchet', () => {
    const s = accumulateWatch(null, { delta_s: 10, position_s: 10, duration_s: 200 }, NOW, 0);
    expect(s.duration_s).toBe(200);
    const s2 = accumulateWatch(null, { delta_s: 10, position_s: 10, duration_s: 200 }, NOW, NaN);
    expect(s2.duration_s).toBe(200);
  });

  it('still clamps per-beat delta and never lets watched_s exceed 2x duration', () => {
    let s: WatchState | null = null;
    for (let i = 0; i < 10; i++) s = accumulateWatch(s, { delta_s: 45, position_s: 45 * (i + 1) }, NOW, 60);
    expect(s!.watched_s).toBeLessThanOrEqual(120);
    expect(s!.watched_pct).toBe(100);
  });
});

describe('withAuthoritativeDuration', () => {
  const stored = (over: Partial<WatchState> = {}): WatchState => ({ watched_s: 460, max_position_s: 460, duration_s: 600, watched_pct: 77, ...over });

  it('recomputes duration_s and watched_pct from the stored watched_s — no new beat required', () => {
    const out = withAuthoritativeDuration(stored(), 400);
    expect(out?.duration_s).toBe(400);
    expect(out?.watched_pct).toBe(100); // capped — 460/400 > 100%
  });

  it('self-heals a poisoned card at completion-check time: stuck at 77% of 600 becomes past 75% of the true 400', () => {
    const poisoned = stored({ watched_s: 310, duration_s: 600, watched_pct: 52 }); // 310/600 = 52%, below 75%
    const healed = withAuthoritativeDuration(poisoned, 400);
    expect(healed?.watched_pct).toBe(78); // 310/400 = 77.5% -> 78%, now past the 75% gate
    expect(meetsWatchRequirement(healed, 0.75).met).toBe(true);
    expect(meetsWatchRequirement(poisoned, 0.75).met).toBe(false); // the un-healed state was stuck
  });

  it('is a no-op when no authoritative duration is given', () => {
    const s = stored();
    expect(withAuthoritativeDuration(s, null)).toEqual(s);
    expect(withAuthoritativeDuration(s, undefined)).toEqual(s);
    expect(withAuthoritativeDuration(s, 0)).toEqual(s);
  });

  it('passes through null/undefined watch state unchanged', () => {
    expect(withAuthoritativeDuration(null, 300)).toBeNull();
    expect(withAuthoritativeDuration(undefined, 300)).toBeNull();
  });
});

describe('isWatchableCard', () => {
  it('is watchable when metadata carries a video url', () => {
    expect(isWatchableCard({ type: 'video', metadata: { video: { url: 'https://youtu.be/abc' } } })).toBe(true);
  });
  it('is watchable for testimonial / podcast even without fixed metadata (per-student resolved)', () => {
    expect(isWatchableCard({ type: 'testimonial', metadata: {} })).toBe(true);
    expect(isWatchableCard({ type: 'podcast', metadata: null })).toBe(true);
  });
  it('is not watchable for a plain non-media card', () => {
    expect(isWatchableCard({ type: 'reflection', metadata: {} })).toBe(false);
    expect(isWatchableCard({ type: 'video', metadata: { video: { url: '   ' } } })).toBe(false);
  });
});

describe('requiredWatchPct', () => {
  it('defaults to 0.75 for a watchable card with no override', () => {
    expect(requiredWatchPct({ type: 'testimonial', metadata: {} })).toBe(DEFAULT_WATCH_PCT);
  });
  it('honours a per-card override', () => {
    expect(requiredWatchPct({ type: 'video', metadata: { video: { url: 'u' } }, completion_rules: { video_watched: 0.5 } })).toBe(0.5);
  });
  it('falls back to the type rule when the card has none', () => {
    expect(requiredWatchPct({ type: 'podcast', metadata: {} }, { video_watched: 0.9 })).toBe(0.9);
  });
  it('ignores out-of-range overrides and uses the default', () => {
    expect(requiredWatchPct({ type: 'podcast', metadata: {}, completion_rules: { video_watched: 2 } })).toBe(DEFAULT_WATCH_PCT);
    expect(requiredWatchPct({ type: 'podcast', metadata: {}, completion_rules: { video_watched: 0 } })).toBe(DEFAULT_WATCH_PCT);
  });
  it('returns null (ungated) for non-watchable cards', () => {
    expect(requiredWatchPct({ type: 'reflection', metadata: {} })).toBeNull();
  });
});

describe('meetsWatchRequirement', () => {
  const st = (over: Partial<WatchState>): WatchState => ({ watched_s: 80, max_position_s: 80, duration_s: 100, watched_pct: 80, ...over });

  it('is met at or above the threshold', () => {
    expect(meetsWatchRequirement(st({ watched_pct: 75 }), 0.75).met).toBe(true);
    expect(meetsWatchRequirement(st({ watched_pct: 90 }), 0.75).met).toBe(true);
  });
  it('is not met below the threshold', () => {
    expect(meetsWatchRequirement(st({ watched_pct: 74 }), 0.75).met).toBe(false);
    expect(meetsWatchRequirement(st({ watched_pct: 50 }), 0.75).met).toBe(false);
  });
  it('is not met when no watch state exists at all', () => {
    expect(meetsWatchRequirement(null, 0.75)).toEqual({ met: false, watched_pct: 0, fail_open: false });
  });
  it('fails open when duration was never measurable but time was watched', () => {
    const v = meetsWatchRequirement(st({ duration_s: 0, watched_pct: 0, watched_s: 40 }), 0.75);
    expect(v.met).toBe(true);
    expect(v.fail_open).toBe(true);
  });
  it('does NOT fail open when nothing has been watched yet', () => {
    expect(meetsWatchRequirement(st({ duration_s: 0, watched_pct: 0, watched_s: 0 }), 0.75).met).toBe(false);
  });
});
