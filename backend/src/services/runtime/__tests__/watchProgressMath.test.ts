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

  it('clamps a playhead left behind by a replaced video to the real duration', () => {
    // The live C118 shape: watched against the old 213s YouTube video, now graded
    // against the 109s mp4 that replaced it.
    const carriedOver = stored({ watched_s: 68, max_position_s: 213, duration_s: 213, watched_pct: 32 });
    const out = withAuthoritativeDuration(carriedOver, 109);
    expect(out?.max_position_s).toBe(109);   // not 213 — that video is gone
    expect(out?.duration_s).toBe(109);
  });

  it('never reduces watched_s when clamping — credit earned is not taken away', () => {
    const carriedOver = stored({ watched_s: 426, max_position_s: 213, duration_s: 213, watched_pct: 100 });
    const out = withAuthoritativeDuration(carriedOver, 109);
    expect(out?.watched_s).toBe(426);
    expect(meetsWatchRequirement(out, 0.75).met).toBe(true);
  });

  it('leaves a playhead inside the real duration exactly where it was', () => {
    const out = withAuthoritativeDuration(stored({ max_position_s: 87, duration_s: 213 }), 109);
    expect(out?.max_position_s).toBe(87);
  });
});

describe('accumulateWatch across a replaced video', () => {
  it('clamps the ratcheted playhead to the authoritative duration', () => {
    // Exactly the row found in production: duration_s had already been re-pinned
    // to 109 by a post-swap beat while max_position_s stayed ratcheted at 213.
    const carriedOver: WatchState = { watched_s: 122, max_position_s: 213, duration_s: 109, watched_pct: 100 };
    const s = accumulateWatch(carriedOver, { delta_s: 10, position_s: 20, duration_s: 109 }, NOW, 109);
    expect(s.max_position_s).toBe(109);
    expect(s.duration_s).toBe(109);
    expect(s.watched_s).toBe(132);   // credit still accrues normally
  });

  it('ignores a client reporting a playhead past the authoritative end', () => {
    const s = accumulateWatch(null, { delta_s: 10, position_s: 9999, duration_s: 109 }, NOW, 109);
    expect(s.max_position_s).toBe(109);
  });

  it('leaves the plain ratchet untouched when no authoritative duration is known', () => {
    // Loom/Wistia/unverified: there is no ceiling to clamp against, and inventing
    // one from the client's own report would be trusting the thing this gate distrusts.
    const s = accumulateWatch(null, { delta_s: 10, position_s: 500, duration_s: 100 }, NOW);
    expect(s.max_position_s).toBe(500);
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

/**
 * COVERAGE, not time spent.
 *
 * Asked by the QA tester 2026-11-21: "Does re-watching the same part count again
 * toward 75%?" It did. `watched_s` counted seconds played and the gate divided
 * that by duration, so replaying the opening cleared the gate without ever
 * reaching the end. These pin the new rule - what was covered, not how long was
 * spent.
 */
describe('accumulateWatch coverage', () => {
  /** Play `seconds` forward from `from`, in 15s beats like a real client. */
  const play = (state: WatchState | null, from: number, seconds: number, duration: number): WatchState => {
    let s = state;
    let pos = from;
    let left = seconds;
    while (left > 0) {
      const step = Math.min(15, left);
      pos += step;
      left -= step;
      s = accumulateWatch(s, { delta_s: step, position_s: pos, duration_s: duration }, NOW);
    }
    return s as WatchState;
  };

  it('THE REPORTED BUG: replaying the first half does not clear a 75% gate', () => {
    let s = play(null, 0, 150, 300);     // first half
    expect(s.watched_pct).toBe(50);
    s = play(s, 0, 150, 300);            // the same half again

    expect(s.watched_s).toBe(300);       // 300 seconds really were played
    expect(s.covered_s).toBe(150);       // of a 300s video, half of it was seen
    expect(s.watched_pct).toBe(50);      // was 100 before this change
    expect(meetsWatchRequirement(s, 0.75).met).toBe(false);
  });

  it('watching it through does clear the gate, and merges into one span', () => {
    const s = play(null, 0, 300, 300);
    expect(s.watched_pct).toBe(100);
    expect(s.segments).toEqual([[0, 300]]);
    expect(meetsWatchRequirement(s, 0.75).met).toBe(true);
  });

  it('a seek forward credits only what was played after it, never the skipped part', () => {
    let s = play(null, 0, 60, 300);      // [0, 60]
    s = play(s, 200, 60, 300);           // seek to 200, play through to 260
    expect(s.covered_s).toBe(120);
    expect(s.segments).toEqual([[0, 60], [200, 260]]);
    expect(s.watched_pct).toBe(40);      // not 87, which the playhead alone would say
  });

  it('scrubbing to the end still earns nothing', () => {
    const s = accumulateWatch(null, { delta_s: 0, position_s: 299, duration_s: 300 }, NOW);
    expect(s.covered_s).toBe(0);
    expect(s.watched_pct).toBe(0);
  });

  it('adjacent beats join into one span rather than accumulating for ever', () => {
    const s = play(null, 0, 120, 300);   // eight 15s beats
    expect(s.segments).toEqual([[0, 120]]);
  });

  it('keeps the time reading for a player that reports no playhead', () => {
    // An audio element with no position would otherwise sit at 0% for ever.
    let s = accumulateWatch(null, { delta_s: 30, duration_s: 100, provider: 'audio' }, NOW);
    s = accumulateWatch(s, { delta_s: 30, duration_s: 100, provider: 'audio' }, NOW);
    expect(s.segments).toEqual([]);
    expect(s.watched_pct).toBe(60);
  });
});

/**
 * Rows written before coverage existed carry no spans. Seeding them from what
 * was already recorded is what lets this ship without a backfill, and these two
 * cases are the whole argument for the seed.
 */
describe('accumulateWatch coverage, migrating a legacy row', () => {
  const legacy = (watched_s: number, max_position_s: number, watched_pct: number): WatchState =>
    ({ watched_s, max_position_s, duration_s: 300, watched_pct } as WatchState);

  it('an honest straight-through watcher keeps their progress', () => {
    const s = accumulateWatch(legacy(300, 300, 100), { delta_s: 5, position_s: 300, duration_s: 300 }, NOW);
    expect(s.watched_pct).toBe(100);
  });

  it('someone who reached 100% by replaying the first half drops to what they actually saw', () => {
    const s = accumulateWatch(legacy(300, 150, 100), { delta_s: 5, position_s: 150, duration_s: 300 }, NOW);
    expect(s.covered_s).toBe(150);
    expect(s.watched_pct).toBe(50);
  });

  it('never seeds further than the seconds actually played', () => {
    // A playhead at 300 with only 30s played cannot mean 300s were covered, so
    // the seeded span is [0, 30] and NOT [0, 300]. The [295, 300] span is this
    // call's own beat, which is why covered_s is 35 rather than 30.
    const s = accumulateWatch(legacy(30, 300, 10), { delta_s: 5, position_s: 300, duration_s: 300 }, NOW);
    expect(s.segments).toEqual([[0, 30], [295, 300]]);
    expect(s.covered_s).toBe(35);
  });
});

describe('withAuthoritativeDuration coverage', () => {
  it('re-expresses coverage against the real duration', () => {
    const watch = { watched_s: 200, max_position_s: 200, duration_s: 600, watched_pct: 33, segments: [[0, 200]], covered_s: 200 } as unknown as WatchState;
    const out = withAuthoritativeDuration(watch, 400)!;
    expect(out.covered_s).toBe(200);
    expect(out.watched_pct).toBe(50);
  });

  it('drops span left behind past the end of a replaced video', () => {
    const watch = { watched_s: 213, max_position_s: 213, duration_s: 213, watched_pct: 100, segments: [[0, 213]], covered_s: 213 } as unknown as WatchState;
    const out = withAuthoritativeDuration(watch, 109)!;
    expect(out.segments).toEqual([[0, 109]]);
    expect(out.watched_pct).toBe(100);
  });
});
