import {
  accumulateWatch,
  isWatchableCard,
  requiredWatchPct,
  meetsWatchRequirement,
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
